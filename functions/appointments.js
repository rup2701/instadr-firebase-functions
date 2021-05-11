'use strict';
const dayjs = require('dayjs');

const functions = require("firebase-functions");
const admin = require("firebase-admin");
// const request = require('request-promise');

exports.appointment = functions.database.ref('/appointments/{doctorId}/{date}/{time}').onWrite(async (change, ctx) => {
  console.log('New appt added for doctor with ID', ctx.params.doctorId);
  
  // if before value does not exist - the appt is still on hold and 
  // patient has not finished the booking process.
  if (!change.before.exists()) {
    return change.before.val();
  }

  // prepare updates to be written to firebase-db

  const doctorId = ctx.params.doctorId;
  
  const dataSnapshot = change.after.val();
  const { patientId, patientName, profileName, dateOfBirth, gender, height, weight, ailment, apptTime, keys, notes} = dataSnapshot;


  var newApptRef = admin.database().ref('appts').push();
  var newApptRefKey = newApptRef.key;

  var updateUserData = {};
  updateUserData[`${patientId}/${profileName}/appts/${newApptRefKey}`] = { "apptTime": apptTime ,'ailment': ailment, 'keys': keys, "notes": notes || null };
  updateUserData[`${patientId}/${profileName}/profile`] = {
    'patientName': patientName,
    'dateOfBirth': dateOfBirth,
    'gender': gender,
    'height': height,
    'weight': weight,
    'keys': keys,
  };
  updateUserData[`${patientId}/${profileName}/lastVisit`] = apptTime;

  console.log('Update my_patients with data', updateUserData);

  // check if patient with patientId exists
  const location = `doctors/${doctorId}/my_patients/`;

  await admin.database().ref(`${location}/patient_list`).orderByChild('patientId').equalTo(patientId).once('value', async (snapshot) => {
    if (snapshot.exists()) {
      
      // // add patient data under its profile name
      let profileExists = false;
      await admin.database().ref(location).child(`${patientId}/${profileName}`).once('value', (snapshot) => {
        if (snapshot.exists()) {
          profileExists = true;
        }
      });

      // new profile - set creation date on the profile
      if (!profileExists) {
        // set join date as today.
        updateUserData[`${patientId}/${profileName}/created`] = dayjs().unix();
      }
      await updateAppts(location, profileName, updateUserData);

    } else {
      var newPatientRef = await admin.database().ref(`${location}/patient_list`).push();
      var newPatientRefKey = newPatientRef.key;

      // first time a patient and profile is being added so add
      // created to profile
    
      updateUserData[`patient_list/${newPatientRefKey}`] = { patientId: patientId };
      updateUserData[`${patientId}/${profileName}/created`] = apptTime;
      await updateAppts(location, profileName, updateUserData);
    }
  })

  return change.after.val();
});

/**
 * 
 * @param {*} profileName 
 * @param {*} apptData 
 */
async function updateAppts(location, profileName, apptData) {
  await admin.database().ref(location).update(apptData, (error) => {
    if (error) {
      console.log('Unable to save new data for patient with patientId', patientId);
    }
  })
}
