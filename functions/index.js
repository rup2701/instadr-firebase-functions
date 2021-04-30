const functions = require('firebase-functions');
let admin = require('firebase-admin');
var apn = require('apn');
admin.initializeApp();

const db = admin.firestore();

// Export functions from the appointments froup
// - newAppointment
// - updateAppoinment
exports.appointments = require('./appointments');

exports.sendPushForIncomingCall = functions.database.ref('/videoCalls/{doctorUId}/{apptTime}/incoming/').onWrite(async (change, ctx) => {

  console.log('change.ref: ' + change.before.ref);
  let dataAfter = change.after.val();
  if (dataAfter === null) { // when a call is cancelled
    console.log('node removed, returning');
    return dataAfter;
  }
  let patientId = dataAfter['patientId'];
  console.log('Calling patient with id: ' + patientId);
  
  let getVOIPDeviceTokensPromise = admin.database().ref(`/patients/${patientId}/deviceToken`).once('value');
  let tokensResult = await Promise.all([getVOIPDeviceTokensPromise]);
  let tokensSnapshot = tokensResult[0];

  if (tokensSnapshot === undefined || !tokensSnapshot.hasChildren()) {
    return console.log('There are no notification tokens to send to.');
  }
  console.log('There are', tokensSnapshot.numChildren(), 'tokens to send notifications to.');
  
  let deviceTokens = Object.keys(tokensSnapshot.val());

  // options for apn provider
  let options = {
    token: {
      key: "./keys/AuthKey_N5F9QSBJD4.p8",
      keyId: "N5F9QSBJD4",
      teamId: "A2AK6QNWF5"
    },
    production: false
  }

  // By default, the provider will connect to the sandbox unless the environment variable NODE_ENV=production is set.
  var apnProvider = new apn.Provider(options);

  //Create a notification object, configure levant parameters
  var note = new apn.Notification();
  note.topic = "com.cg.InstaDr.voip";
  if (dataAfter['cancelCall'] === true) {
    note.payload = { 
      'handle': `Dr. ${dataAfter['handle']}`,
      'cancelCall': true
    };
  } else {
    note.payload = { 
      'handle': `Dr. ${dataAfter['handle']}`
    };
  }
  // send push notif
  apnProvider.send(note, deviceTokens).then( (result) => {

  if (dataAfter['cancelCall'] === true) {
    console.log('removing node for incoming call');
    change.before.ref.remove();
  }
  
  // remove any obsolete device tokens 
  let tokensToRemove = []
  // iterate failed to check if there were more than one device 
  // token available and some of them may have been invalid and
  // them to tokensRemove
  result.failed.forEach ( failed => {
    console.log('Removing tokens');
    tokensToRemove.push(tokensSnapshot.ref.child(failed.device).remove());
  });
  // execute the remove token promises.
  return Promise.all(tokensToRemove);
  }).catch((error) => {
    console.error(error);
  });
  
  return change.after.val();
  // return snapshot.val();
});

exports.newChatMessage = functions.firestore.document('messages/{doctorUid}/{patientUid}/{messageId}').onCreate(async (snap, context) => {
  
  const doctorUid = context.params.doctorUid;
  const patientUid = context.params.patientUid;
 
  // the message that triggered the function
  const newValue = snap.data();

  // fetch the documet snapshot for this doctor
  let docRef = db.doc(`messages/${doctorUid}`);
  let documentSnapshot = await docRef.get();
  if (!documentSnapshot.exists) {
    // console.log('Online: ', documentSnapshot.data().online.);
    console.log('document snapshot does not exist');
    return newValue;
  }

  // document data
  const doc = documentSnapshot.data();
  
  // check if document has the online field
  if (doc['online'] === undefined) {
    // if sender is doctor
    if (newValue.senderId === doctorUid) {
      // check if patient is online 
      console.log('Patient is offline, send push notif');
      send_push_notif('patients', patientUid, doctorUid);
    } else {
      console.log('Doctor is offline, send push notif');
      send_push_notif('doctors', doctorUid, patientUid);
    }
    return newValue;
  }

  // if sender is doctor
  if (newValue.senderId === doctorUid) {
    // check if patient is online 
    if (!isOnline(doc['online'], patientUid)) {
      console.log('Patient is offline, send push notif');
      send_push_notif('patients', patientUid, doctorUid);
    }
  } else {
    if (!isOnline(doc['online'], doctorUid)) {
      console.log('Doctor is offline, send push notif');
      send_push_notif('doctors', doctorUid, patientUid);
    }
  }
  return newValue;
})

function isOnline(online, uid) {
  return online.some(e => e === uid)
}

/*
 * Send out push notification with payload.
 * 
 * @param {*} payload 
 */
async function send_push_notif(user_type, receiver_id, sender_id) {
  let getDeviceTokensPromise = admin.database().ref(`/${user_type}/${receiver_id}/registrationTokens`).once('value');
  let tokensResult = await Promise.all([getDeviceTokensPromise]);
  let tokensSnapshot = tokensResult[0];

  if (tokensSnapshot === undefined || !tokensSnapshot.hasChildren()) {
    return console.log(`No available notification tokens for: ${user_id} `);
  }

   // Listing all tokens as an array.
  let tokens = Object.keys(tokensSnapshot.val());

  const payload = {
    notification: {
      title: "New message",
      body: "New Messsage from `Dr. ${}` "
    },
    data : {
      "category": "CHAT_MESSAGE",
      "from_uid": `${sender_id}`
    }
  };
  let response = await admin.messaging().sendToDevice(tokens, payload);
  // For each message check if there was an error.
  const tokensToRemove = [];
  response.results.forEach((result, index) => {
    const error = result.error;
    if (error) {
      console.error('Failure sending notification to', tokens[index], error);
      // Cleanup the tokens who are not registered anymore.
      if (error.code === 'messaging/invalid-registration-token' ||
        error.code === 'messaging/registration-token-not-registered') {
        tokensToRemove.push(tokensSnapshot.ref.child(tokens[index]).remove());
      }
    }
  });
  return Promise.all(tokensToRemove);
}