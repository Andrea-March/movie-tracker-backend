const express = require('express');
const router = express.Router();
const User = require('../models/User'); // Modello utente che contiene il token FCM
const admin = require('../utils/firebaseAdmin');


function sendPushNotification(token, title, body) {
    const message = {
      notification: {
        title: title,
        body: body
      },
      token: token
    };
  
    admin.messaging().send(message)
      .then(response => {
        console.log('Successfully sent message:', response);
      })
      .catch(error => {
        console.log('Error sending message:', error);
      });
  }

router.post('/send-notification', async (req, res) => {
  const { userId, title, body } = req.body;

  // Recupera l'utente dal database e il suo token FCM
  const user = await User.findById(userId);
  if (!user || !user.fcmToken) {
    return res.status(400).send('No FCM token found for this user');
  }

  // Invia la notifica push
  const token = user.fcmToken;
  sendPushNotification(token, title, body);

  res.status(200).send('Notification sent');
});

// Funzione per aggiornare il token FCM
async function updateFcmToken(userId, token) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        return { status: 404, message: 'User not found' };
      }
  
      // Aggiorna il campo fcmToken con il nuovo token
      user.fcmToken = token;
      await user.save();
  
      return { status: 200, message: 'FCM token updated successfully' };
    } catch (error) {
      console.error(error);
      return { status: 500, message: 'Internal server error' };
    }
  }

module.exports = router;
module.exports.updateFcmToken = updateFcmToken;