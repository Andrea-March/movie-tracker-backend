const express = require("express");
const mongoose = require("mongoose");
const { authMiddleware } = require("./authroutes");
const { cacheData, getData, quickCacheData } = require("../utils/redisclient");
const crypto = require("crypto");
const InviteToken = require("../models/InviteToken");
const Group = require("../models/Group");
const GroupMovie = require("../models/GroupMovie");
const GroupMember = require("../models/GroupMember")
const Poll = require("../models/Poll");
const Vote = require("../models/Vote");
const Event = require("../models/Event");

const router = express.Router();

/**
 * @route GET /api/groups
 * @query ?q=...&limit=20&skip=0
 * @desc Lista dei gruppi dell'utente con anteprime
 */
router.get("/", authMiddleware, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.userId);
  const limit = Math.min(parseInt(req.query.limit || "20", 10), 50);
  const skip = Math.max(parseInt(req.query.skip || "0", 10), 0);
  /* const q = (req.query.q || "").trim(); (opzionale) filtro per ricerca q su name/description*/ 

  try {
    const pipeline = [
      // 1) Trova membership dell'utente
      { $match: { user: userId } },
      { $sort: { joinedAt: -1 } },
      { $skip: skip },
      { $limit: limit },

      // 2) Join al documento Group
      {
        $lookup: {
          from: "groups",
          localField: "group",
          foreignField: "_id",
          as: "group"
        }
      },
      { $unwind: "$group" },

      // 3) (opzionale) filtro per ricerca q su name/description
/*       ...(q
        ? [{
            $match: {
              $or: [
                { "group.name": { $regex: q, $options: "i" } },
                { "group.description": { $regex: q, $options: "i" } }
              ]
            }
          }]
        : []), */

      // 4) Preview membri (max 3)
      {
        $lookup: {
          from: "groupmembers",
          let: { gid: "$group._id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$group", "$$gid"] } } },
            { $sort: { role: 1, joinedAt: -1 } }, // owner/admin prima
            { $limit: 3 },
            {
              $lookup: {
                from: "users",
                localField: "user",
                foreignField: "_id",
                as: "u"
              }
            },
            { $unwind: "$u" },
            { $project: { _id: 0, userId: "$u._id", name: "$u.name", avatar: "$u.avatar", role: 1 } }
          ],
          as: "membersPreview"
        }
      },

      // 5) Prossimo evento (scheduled, startsAt futuro più vicino)
      {
        $lookup: {
          from: "events",
          let: { gid: "$group._id", now: new Date() },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$group", "$$gid"] },
                    { $eq: ["$status", "scheduled"] },
                    { $gte: ["$startsAt", "$$now"] }
                  ]
                }
              }
            },
            { $sort: { startsAt: 1 } },
            { $limit: 1 },
            { $project: { _id: 1, title: 1, startsAt: 1, location: 1 } }
          ],
          as: "nextEvent"
        }
      },
      { $addFields: { nextEvent: { $first: "$nextEvent" } } },

      // 5.b) Risolviamo lo username dell'owner
        {
          $lookup: {
            from: "users",
            let: { oid: "$group.owner" },
            pipeline: [
              { $match: { $expr: { $eq: ["$_id", "$$oid"] } } },
              { $project: { _id: 0, username: 1 } }
            ],
            as: "ownerUser"
          }
        },
        {
          $set: {
            owner: { $ifNull: [ { $first: "$ownerUser.username" }, null ] }
          }
        },

      // 6) Shape finale
      {
        $project: {
          _id: 0,
          groupId: "$group._id",
          name: "$group.name",
          description: "$group.description",
          icon: "$group.icon",
          invitePolicy: "$group.invitePolicy",
          visibility: "$group.visibility",
          settings: "$group.settings",
          owner: "$owner",
          membersCount: "$group.membersCount",
          createdAt: "$group.createdAt",
          updatedAt: "$group.updatedAt",
          myRole: "$role",
          membersPreview: 1,
          nextEvent: 1
        }
      }
    ];

    const rows = await GroupMember.aggregate(pipeline).exec();

    // Count totale (per paginate UI): fai una seconda query leggera
    const total = await GroupMember.countDocuments({ user: userId });

    res.json({
      total,
      limit,
      skip,
      items: rows
    });
  } catch (err) {
    console.error("Errore fetching gruppi:", err);
    res.status(500).json({ error: "Errore fetching gruppi" });
  }
});

/**
 * @route POST /api/groups
 * @desc Crea un nuovo gruppo
 */
router.post("/", authMiddleware, async (req, res) => {
  const { name, description, icon, invitePolicy, visibility, settings } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Il nome del gruppo è obbligatorio" });
  }

  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // 1) Crea il gruppo (membersCount: 1 by design, owner = req.userId)
    const group = await Group.create([{
      name: String(name).trim(),
      description: description?.trim(),
      owner: req.userId,
      membersCount: 1,
      icon: icon || undefined,
      invitePolicy: invitePolicy || undefined, // "token" default a schema
      visibility: visibility || undefined,     // "private" default a schema
      settings: settings || undefined          // user override opzionale
    }], { session }).then(r => r[0]);

    // 2) Crea membership dell’owner
    await GroupMember.create([{
      group: group._id,
      user: req.userId,
      role: "owner",
      joinedAt: new Date()
    }], { session });

    // (opzionale) 3) Qualsiasi side-effect: analytics/eventi, ecc.

    await session.commitTransaction();
    session.endSession();

    // Risposta “safe” (niente cose inutili)
    res.status(201).json({
      _id: group._id,
      name: group.name,
      description: group.description,
      icon: group.icon,
      invitePolicy: group.invitePolicy,
      visibility: group.visibility,
      settings: group.settings,
      owner: group.owner,
      membersCount: group.membersCount,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    console.error("Errore creazione gruppo:", err);
    // Esempio: se vuoi distinguere nomi duplicati/validazione, puoi fare branch su err.name/err.code
    res.status(500).json({ error: "Errore creazione gruppo" });
  }
});


router.get("/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Group id non valido" });

  const userId = new mongoose.Types.ObjectId(req.userId);
  const groupId = new mongoose.Types.ObjectId(id);

  const include = new Set(String(req.query.include || "").split(",").filter(Boolean));
  const membersLimit = Math.min(parseInt(req.query.membersLimit || "20", 10), 100);
  const watchlistLimit = Math.min(parseInt(req.query.watchlistLimit || "20", 10), 100);
  const watchlistSkip = Math.max(parseInt(req.query.watchlistSkip || "0", 10), 0);

      const base = [
      { $match: { _id: groupId } },

      // Autorizzazione: membro o owner
      {
        $lookup: {
          from: "groupmembers",
          let: { gid: "$_id", uid: userId },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ["$group", "$$gid"] }, { $eq: ["$user", "$$uid"] } ] } } },
            { $project: { role: 1, _id: 0 } }
          ],
          as: "me"
        }
      },
      {
        $set: {
          // true se esiste una membership
          __isMember: { $gt: [ { $size: "$me" }, 0 ] },
          // true se sei l'owner nel documento del gruppo
          __isOwner: { $eq: ["$owner", userId] },
        }
      },
      {
        // passa solo se membro o owner
        $match: { $or: [ { __isMember: true }, { __isOwner: true } ] }
      },
      {
        // calcola myRole: se owner, "owner", altrimenti ruolo dalla membership (o null)
        $set: {
          myRole: {
            $cond: [
              "$__isOwner",
              "owner",
              { $ifNull: [ { $first: "$me.role" }, null ] }
            ]
          }
        }
      },
      // pulizia
      { $unset: ["me", "__isMember", "__isOwner"] },
    ];
  const lookups = [];

  // nextEvent solo se non lo hai già o vuoi riallinearli (facoltativo)
  if (include.has("nextEvent")) {
    lookups.push(
      {
        $lookup: {
          from: "events",
          let: { gid: "$_id", now: new Date() },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ["$group", "$$gid"] }, { $eq: ["$status", "scheduled"] }, { $gte: ["$startsAt", "$$now"] } ] } } },
            { $sort: { startsAt: 1 } },
            { $limit: 1 },
            { $project: { _id: 1, title: 1, startsAt: 1, location: 1 } }
          ],
          as: "nextEvent"
        }
      },
      { $addFields: { nextEvent: { $first: "$nextEvent" } } }
    );
  }

  if (include.has("members")) {
    lookups.push(
      {
        $lookup: {
          from: "groupmembers",
          let: { gid: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$group", "$$gid"] } } },
            {
              $addFields: {
                roleOrder: {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$role", "owner"] }, then: 0 },
                      { case: { $eq: ["$role", "admin"] }, then: 1 }
                    ],
                    default: 2
                  }
                }
              }
            },
            { $sort: { roleOrder: 1, joinedAt: -1 } },
            { $limit: membersLimit },
            {
              $lookup: { from: "users", localField: "user", foreignField: "_id", as: "u" }
            },
            { $unwind: "$u" },
            { $project: { _id: 0, userId: "$u._id", name: "$u.name", avatar: "$u.avatar", role: 1, joinedAt: 1 } }
          ],
          as: "members"
        }
      }
    );
  }

  if (include.has("watchlist")) {
    lookups.push(
      {
        $lookup: {
          from: "groupmovies",
          let: { gid: "$_id" },
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ["$group", "$$gid"] }, { $eq: ["$status", "pending"] } ] } } },
            { $sort: { addedAt: -1 } },
            { $skip: watchlistSkip },
            { $limit: watchlistLimit },
            { $project: { 
                _id: 1, addedAt: 1, addedBy: 1, status: 1,
                snapshot: { tmdbId: 1, title: 1, year: 1, runtime: 1, poster: 1 }
            } }
          ],
          as: "watchlist"
        }
      },
      // conteggio totale separato nella stessa aggregazione
      {
        $lookup: {
          from: "groupmovies",
          let: { gid: "$__id" }, // non funziona: usare di nuovo $_id
          pipeline: [
            { $match: { $expr: { $and: [ { $eq: ["$group", groupId] }, { $eq: ["$status", "pending"] } ] } } },
            { $count: "n" }
          ],
          as: "watchlistTotalAgg"
        }
      },
      { $addFields: { watchlistTotal: { $ifNull: [ { $arrayElemAt: ["$watchlistTotalAgg.n", 0] }, 0 ] } } },
      { $project: { watchlistTotalAgg: 0 } }
    );
  }

  if (include.has("settings")) {
    // Nessun lookup: sono nel documento Group
  }

  // Proiezione finale
    const baseProject = {
      _id: 1, name: 1, description: 1, icon: 1,
      invitePolicy: 1, visibility: 1, settings: 1,
      owner: 1, membersCount: 1, createdAt: 1, updatedAt: 1,
      myRole: 1
    };

    const project = {
      $project: {
        ...baseProject,
        ...(include.has("nextEvent") ? { nextEvent: 1 } : {}),
        ...(include.has("members")   ? { members: 1 }   : {}),
        ...(include.has("watchlist") ? { watchlist: 1, watchlistTotal: 1 } : {})
      }
    };

  try {
    const pipeline = [...base, ...lookups, project];
    const [doc] = await Group.aggregate(pipeline).exec();
    if (!doc) return res.status(404).json({ error: "Gruppo non trovato o accesso negato" });

    // ETag/IMS facoltativo: usa updatedAt come validatore
    const etag = `"${doc._id.toString()}-${new Date(doc.updatedAt).getTime()}"`;
    res.set("ETag", etag);

    if (req.headers["if-none-match"] === etag) {
      return res.status(304).end();
    }

    res.json(doc);
  } catch (err) {
    console.error("Errore dettaglio gruppo:", err);
    res.status(500).json({ error: "Errore dettaglio gruppo" });
  }
});


router.post("/:id/watchlist", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Group id non valido" });

  const groupId = new mongoose.Types.ObjectId(id);
  const userId  = new mongoose.Types.ObjectId(req.userId);

  // Dati opzionali dal client (se la UI li ha già)
  const {
    tmdbId, title, overview, poster_path, release_date,
    runtime, vote_average, genres, genre_ids, notes
  } = req.body;

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: "tmdbId non valido" });
  }

  const existing = await GroupMovie.findOne({ group: groupId, movie: tmdbId })
    .select('_id')
    .lean();

  if (existing) {
    return res.status(409).json({
      code: 'ALREADY_EXISTS',
      message: 'Movie già presente nel gruppo',
      groupMovieId: existing._id,
    });
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1) devo essere membro del gruppo
    const membership = await GroupMember.findOne({ group: groupId, user: userId }).session(session);
    if (!membership) throw new Error("Accesso negato: non sei membro del gruppo");

    // 2) Prova a trovare Movie
    let movie = await Movie.findOne({ $or: [ { tmdbId }, { legacyId: String(tmdbId) } ] }).session(session);

    // 3) Se non esiste e NON ho metadati dal client → fetch TMDB
    let data = null;
    if (!movie && !title) {
      data = await tmdb.getMovie(tmdbId); // usa la tua service con cache Redis
      if (!data) throw new Error("Film TMDB non trovato");
    }

    // 4) Se non esiste → upsert con ciò che ho (client o TMDB)
    if (!movie) {
      const source = title ? {
        tmdbId,
        legacyId: String(tmdbId),
        title,
        overview,
        poster_path,
        release_date: release_date ? new Date(release_date) : undefined,
        releaseYear: release_date ? new Date(release_date).getUTCFullYear() : undefined,
        runtime,
        vote_average,
        genres,
        genre_ids
      } : mapTmdbToMovieDoc(data);

      movie = await Movie.findOneAndUpdate(
        { $or: [ { tmdbId }, { legacyId: String(tmdbId) } ] },
        { $setOnInsert: pruneUndefined(source) },
        { upsert: true, new: true, session }
      );
    }

    // 5) Crea GroupMovie (idempotente via unique index {group,movie})
    const snapshot = {
      tmdbId: movie.tmdbId ?? Number(movie.legacyId),
      title: movie.title,
      year: movie.releaseYear ?? (movie.release_date ? movie.release_date.getUTCFullYear() : undefined),
      runtime: movie.runtime,
      poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined
    };

    let item;
    try {
      item = await GroupMovie.create([{
        group: groupId,
        movie: movie._id,
        addedBy: userId,
        status: "pending",
        notes: notes?.trim(),
        snapshot
      }], { session }).then(r => r[0]);
    } catch (e) {
      if (e?.code === 11000) {
        item = await GroupMovie.findOne({ group: groupId, movie: movie._id }).session(session);
      } else throw e;
    }

    await session.commitTransaction();
    session.endSession();

    return res.status(201).json({
      _id: item._id,
      group: item.group,
      movie: item.movie,
      addedBy: item.addedBy,
      addedAt: item.addedAt,
      status: item.status,
      notes: item.notes,
      snapshot: item.snapshot
    });
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    const msg = err.message || "Errore aggiunta alla watchlist";
    const status = msg.startsWith("Accesso negato") ? 403 : (msg.includes("TMDB") ? 404 : 500);
    return res.status(status).json({ error: msg });
  }
});
// Helpers
function pruneUndefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([,v]) => v !== undefined));
}
function mapTmdbToMovieDoc(m) {
  return {
    tmdbId: m.id,
    legacyId: String(m.id),
    title: m.title,
    overview: m.overview,
    poster_path: m.poster_path,
    release_date: m.release_date ? new Date(m.release_date) : undefined,
    releaseYear: m.release_date ? new Date(m.release_date).getUTCFullYear() : undefined,
    runtime: m.runtime,
    vote_average: m.vote_average,
    // se vuoi: genres come nomi
    genres: Array.isArray(m.genres) ? m.genres.map(g => g.name) : undefined,
    genre_ids: Array.isArray(m.genres) ? m.genres.map(g => g.id) : undefined
  };
}


/**
 * @route GET /api/groups/:groupId/movies
 * @desc Lista film del gruppo
 */
router.get("/:groupId/movies", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  try {
    const movies = await GroupMovie.find({ group: groupId })
      .populate("movie", "title poster_path release_date")
      .populate("addedBy", "username");
    res.json(movies);
  } catch (err) {
    console.error("Errore fetching film del gruppo:", err.message);
    res.status(500).json({ error: "Errore fetching film del gruppo" });
  }
});

/**
 * @route POST /api/groups/:groupId/polls
 * @desc Crea un nuovo poll per il gruppo
 */
router.post("/:groupId/polls", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { title, options, endsAt } = req.body; // options = array di movieId

  if (!options || !Array.isArray(options) || options.length === 0) {
    return res.status(400).json({ error: "Opzioni poll mancanti" });
  }

  try {
    const newPoll = await Poll.create({
      group: groupId,
      title: title || "Scegli il prossimo film",
      options: options.map(movieId => ({ movie: movieId })),
      createdBy: req.userId,
      endsAt
    });
    res.status(201).json(newPoll);
  } catch (err) {
    console.error("Errore creazione poll:", err.message);
    res.status(500).json({ error: "Errore creazione poll" });
  }
});

/**
 * @route POST /api/polls/:pollId/votes
 * @desc Vota un film in un poll
 */
router.post("/polls/:pollId/votes", authMiddleware, async (req, res) => {
  const { pollId } = req.params;
  const { movieId } = req.body;

  if (!movieId) return res.status(400).json({ error: "movieId è obbligatorio" });

  try {
    const existingVote = await Vote.findOne({ poll: pollId, user: req.userId });
    if (existingVote) return res.status(400).json({ error: "Hai già votato questo poll" });

    const vote = await Vote.create({
      poll: pollId,
      user: req.userId,
      optionMovie: movieId
    });

    res.status(201).json(vote);
  } catch (err) {
    console.error("Errore voto poll:", err.message);
    res.status(500).json({ error: "Errore durante il voto" });
  }
});

/**
 * @route POST /api/groups/:groupId/events
 * @desc Crea un nuovo evento nel gruppo
 */
router.post("/:groupId/events", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { title, movieId, startsAt, endsAt, location } = req.body;

  if (!title || !startsAt) return res.status(400).json({ error: "Titolo e data di inizio obbligatori" });

  try {
    const newEvent = await Event.create({
      group: groupId,
      title,
      movie: movieId,
      startsAt,
      endsAt,
      location,
      createdBy: req.userId
    });
    res.status(201).json(newEvent);
  } catch (err) {
    console.error("Errore creazione evento:", err.message);
    res.status(500).json({ error: "Errore creazione evento" });
  }
});

/**
 * @route GET /api/groups/:groupId/events
 * @desc Lista eventi futuri del gruppo
 */
router.get("/:groupId/events", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  try {
    const events = await Event.find({ group: groupId, startsAt: { $gte: new Date() } })
      .sort({ startsAt: 1 });
    res.json(events);
  } catch (err) {
    console.error("Errore fetching eventi:", err.message);
    res.status(500).json({ error: "Errore fetching eventi" });
  }
});


router.post("/:groupId/invite", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { maxUses, expiresAt } = req.body; // opzionale

  try {
    const tokenString = crypto.randomBytes(16).toString("hex");
    const invite = await InviteToken.create({
      group: groupId,
      token: tokenString,
      createdBy: req.userId,
      expiresAt: expiresAt || new Date(+new Date() + 7*24*60*60*1000),
      maxUses: maxUses || 1
    });

    res.status(201).json({
      link: `${process.env.FRONTEND_URL}/join/${tokenString}`,
      token: tokenString,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt
    });
  } catch (err) {
    console.error("Errore generazione token invito:", err.message);
    res.status(500).json({ error: "Errore generazione invito" });
  }
});


router.post("/invite/:token/join", authMiddleware, async (req, res) => {
  const { token } = req.params;

  try {
    const invite = await InviteToken.findOne({ token }).populate("group");

    if (!invite) return res.status(404).json({ error: "Token non valido" });
    if (invite.revoked) return res.status(400).json({ error: "Token revocato" });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: "Token scaduto" });
    if (invite.usedCount >= invite.maxUses) return res.status(400).json({ error: "Token esaurito" });

    // Aggiungi l’utente al gruppo se non presente
    if (!invite.group.members.includes(req.userId)) {
      invite.group.members.push(req.userId);
      await invite.group.save();
    }

    // Incrementa usedCount
    invite.usedCount += 1;
    await invite.save();

    res.json({ message: "Sei stato aggiunto al gruppo!", group: invite.group });
  } catch (err) {
    console.error("Errore join gruppo via token:", err.message);
    res.status(500).json({ error: "Impossibile unirsi al gruppo" });
  }
});

module.exports = router;