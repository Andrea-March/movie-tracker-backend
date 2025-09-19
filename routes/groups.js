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
const Movie = require("../models/Movie");
const { getMovieById, getMovieTrailer } = require("./movies");

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

// versione semplificata per la dropdown "aggiungi un film ad un gruppo"
router.get("/dropdown", authMiddleware, async (req, res) => {
  const userId = new mongoose.Types.ObjectId(req.userId);

  try {
    const memberships = await GroupMember.aggregate([
      { $match: { user: userId } },
      {
        $lookup: {
          from: "groups",
          localField: "group",
          foreignField: "_id",
          as: "group"
        }
      },
      { $unwind: "$group" },
      { $sort: { "group.name": 1 } }, // ordina alfabetico
      {
        $project: {
          _id: 0,
          groupId: "$group._id",
          name: "$group.name",
          icon: "$group.icon"
        }
      }
    ]).exec();

    res.json(memberships);
  } catch (err) {
    console.error("Errore fetching gruppi (dropdown):", err);
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
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Group id non valido" });

    const userId = req.userId;

    // leggi gruppo
    const group = await Group.findById(id)
      .populate("owner", "username") // ← solo i campi che ti servono
      .lean();
    if (!group) return res.status(404).json({ error: "Gruppo non trovato" });

    // check membership / owner
    const isOwner = String(group.owner._id) === String(userId);
    const membership = await GroupMember.findOne({ group: id, user: userId }).lean();
    if (!isOwner && !membership) {
      return res.status(403).json({ error: "Accesso negato" });
    }
    // base doc
    const doc = {
      _id: group._id,
      name: group.name,
      description: group.description,
      icon: group.icon,
      invitePolicy: group.invitePolicy,
      visibility: group.visibility,
      settings: group.settings,
      owner: {
        _id: group.owner._id,
        username: group.owner.username
      },
      membersCount: group.membersCount,
      createdAt: group.createdAt,
      updatedAt: group.updatedAt,
      myRole: isOwner ? "owner" : membership.role
    };
    // include dinamici
    const include = new Set(String(req.query.include || "").split(",").filter(Boolean));

    if (include.has("members")) {
      doc.members = await GroupMember.find({ group: id })
        .sort({ role: 1, joinedAt: -1 })
        .limit(20)
        .populate("user", "username avatar")
        .lean()
        .then(list => list.map(m => ({
          userId: m.user._id,
          name: m.user.name,
          avatar: m.user.avatar,
          role: m.role,
          joinedAt: m.joinedAt
        })));
    }

    if (include.has("watchlist")) {
      doc.watchlist = await GroupMovie.find({ group: id, status: "to-watch" })
        .sort({ addedAt: -1 })
        .skip(parseInt(req.query.watchlistSkip || "0", 10))
        .limit(parseInt(req.query.watchlistLimit || "20", 10))
        .lean();
      doc.watchlistTotal = await GroupMovie.countDocuments({ group: id, status: "to-watch" });
    }

    if (include.has("nextEvent")) {
      doc.nextEvent = await Event.findOne({
        group: id,
        status: "scheduled",
        startsAt: { $gte: new Date() }
      })
        .sort({ startsAt: 1 })
        .select("_id title startsAt location movie")
        .populate("movie", "poster_path title") // aggiunge poster e titolo del film
        .lean();
    }

    res.json(doc);
  } catch (err) {
    console.error("Errore dettaglio gruppo:", err);
    res.status(500).json({ error: "Errore dettaglio gruppo" });
  }
});

//FIN QUA OK


router.post("/:id/watchlist", authMiddleware, async (req, res) => {
  const { id } = req.params;
  if (!mongoose.isValidObjectId(id)) return res.status(400).json({ error: "Group id non valido" });

  const groupId = new mongoose.Types.ObjectId(id);
  const userId  = new mongoose.Types.ObjectId(req.userId);

  // Dati opzionali dal client (se la UI li ha già)
  const {
    tmdbId, title, overview, poster_path, release_date,
    runtime, vote_average, genres, genre_ids
  } = req.body.movie;
  const trailer_url = req.body.movie.trailerUrl;

  if (!Number.isInteger(tmdbId) || tmdbId <= 0) {
    return res.status(400).json({ error: "tmdbId non valido" });
  }


  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1) devo essere membro del gruppo
    const membership = await GroupMember.findOne({ group: groupId, user: userId }).session(session);
    if (!membership) throw new Error("Accesso negato: non sei membro del gruppo");

    // 2) Prova a trovare Movie
    let movie = await Movie.findOne({ $or: [ { tmdbId }, { legacyId: Number(tmdbId) } ] }).session(session);

    // 3) Se non esiste e NON ho metadati dal client → fetch TMDB
    let data = null;
    if (!movie) {
      let data = await getMovieById(tmdbId); 
      if (!data) throw new Error("Film TMDB non trovato");
      data.trailer_url = trailer_url;
      data.genres = genres
      data.poster_path = "https://image.tmdb.org/t/p/original" + poster_path
    }

    // 4) Se non esiste → upsert con ciò che ho (client o TMDB)
    if (!movie) {
      const source = title ? {
        tmdbId,
        legacyId: String(tmdbId),
        title,
        overview,
        poster_path: "https://image.tmdb.org/t/p/original" + poster_path,
        release_date: release_date ? new Date(release_date) : undefined,
        releaseYear: release_date ? new Date(release_date).getUTCFullYear() : undefined,
        runtime,
        vote_average,
        genres,
        genre_ids,
        trailer_url
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
      poster: movie.poster_path ? movie.poster_path : undefined,
      trailer_url: movie.trailer_url || undefined,
      genres: movie.genres,
      vote_average: movie.vote_average,
    };

    let item;
    try {
      item = await GroupMovie.create([{
        group: groupId,
        movie: movie._id,
        addedBy: userId,
        status: "to-watch",
        snapshot
      }], { session }).then(r => r[0]);
    } catch (e) {
      console.log(e.message)
      if (e?.code === 11000) {
        return res.status(400).json({error: "Film già aggiunto al gruppo"})
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
    genre_ids: Array.isArray(m.genres) ? m.genres.map(g => g.id) : undefined,
    trailer_url: m.trailer_url ? m.trailer_url : undefined
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




//DA QUA OK
router.post("/:groupId/invite", authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  let { maxUses = 50, expiresAt } = req.body;

  if (!expiresAt) {
    expiresAt = new Date(Date.now() + 0.5 * 24 * 60 * 60 * 1000);
  } else {
    expiresAt = new Date(expiresAt);
  }

  const maxExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  if (isNaN(expiresAt.getTime())) return res.status(400).json({ error: "expiresAt non valida" });
  if (expiresAt > maxExpiry) return res.status(400).json({ error: "Scadenza oltre 30 giorni" });

  try {
    // 🔹 cerca se esiste già un token valido
    const existing = await InviteToken.findOne({
      group: groupId,
      expiresAt: { $gt: new Date() },                 // non scaduto
      $expr: { $lt: ["$usedCount", "$maxUses"] }      // non esaurito
    }).sort({ createdAt: -1 });

    if (existing) {
      return res.json({
        link: `${process.env.CLIENT_URL}/join/${existing.token}`,
        token: existing.token,
        maxUses: existing.maxUses,
        expiresAt: existing.expiresAt
      });
    }

    // 🔹 altrimenti, genera nuovo token
    const tokenString = crypto.randomBytes(16).toString("hex");
    const invite = await InviteToken.create({
      group: groupId,
      token: tokenString,
      createdBy: req.userId,
      expiresAt,
      maxUses
    });

    return res.status(201).json({
      link: `${process.env.CLIENT_URL}/join/${tokenString}`,
      token: tokenString,
      maxUses: invite.maxUses,
      expiresAt: invite.expiresAt
    });
  } catch (err) {
    console.error("Errore generazione token invito:", err.message);
    res.status(500).json({ error: "Errore generazione invito" });
  }
});

router.post("/join/:token", authMiddleware, async (req, res) => {
  try {
    // 1) Consuma il token
    const invite = await InviteToken.consume(req.params.token);

    // 2) Crea membership (idempotente grazie all’indice unique)
    const member = await GroupMember.create({
      group: invite.group,
      user: req.userId,
      role: "member",
      joinedAt: new Date()
    }).catch(err => {
      if (err.code === 11000) {
        throw new Error("Sei già nel gruppo");
      }
      throw err;
    });

    // 3) Aggiorna il contatore nel group
    await Group.updateOne(
      { _id: invite.group },
      { $inc: { membersCount: 1 } }
    );

    res.json({ ok: true, groupId: String(invite.group) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/invites/:token", authMiddleware, async (req, res) => {
  const invite = await InviteToken.findOne({ token: req.params.token }).populate("group", "owners admins");
  if (!invite) return res.status(404).json({ error: "Invito non trovato" });

  const { group } = invite;
  const canRevoke = group.owners?.includes(req.userId) || group.admins?.includes(req.userId);
  if (!canRevoke) return res.status(403).json({ error: "Permesso negato" });

  invite.revoked = true;
  await invite.save();
  res.status(200).json({ ok: true });
});

module.exports = router;