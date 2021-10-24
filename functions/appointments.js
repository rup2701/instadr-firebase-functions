'use strict';
const dayjs = require('dayjs');

const functions = require("firebase-functions");
const admin = require("firebase-admin");
// const request = require('request-promise');

exports.new_appointment = functions.database.ref('/appointments/{doctorId}/{appt_date}/{appt_time}').onWrite(async (change, ctx) => {
  console.log('New appt added for doctor with ID', ctx.params.doctorId);
  
  // if before value does not exist - the appt is still on hold and 
  // patient has not finished the booking process.
  if (!change.before.exists()) {
    return change.before.val();
  }

  // prepare updates to be written to firebase-db

  const doctorId = ctx.params.doctorId;
  const appt_date = ctx.params.appt_date;
  
  const dataSnapshot = change.after.val();
  const { patientId, lastName, firstName, profileName, dateOfBirth, gender, height, weight, ailment, apptTime, keys, notes} = dataSnapshot;

  // prepare update for which a new appt was added or modified (notes/rx/labs data added)
  var updateUserData = {};
  updateUserData[`${patientId}/${profileName}/appts/${appt_date}`] = { "apptTime": apptTime ,'ailment': ailment, 'keys': keys, "notes": notes || null };
  updateUserData[`${patientId}/${profileName}/profile`] = {
    'lastName': lastName,
    'firstName': firstName,
    'dateOfBirth': dateOfBirth,
    'gender': gender,
    'height': height,
    'weight': weight,
    'keys': keys,
    'patientId': patientId
  };
  updateUserData[`${patientId}/${profileName}/lastVisit`] = apptTime;

  const location = `doctors/${doctorId}/my_patients/`;
  let patient_exists = false;

  // check if the patient exists
  await admin.database().ref(`${location}/patient_list`).orderByChild('patientId').equalTo(patientId).once('value', async (snapshot) => {
    if (snapshot.exists()) {
      patient_exists = true; 
    }
  })
  
  if (patient_exists) {
    updateExistingPatient(location, patientId, profileName, updateUserData, apptTime);
  } else {
    addNewPatient(location, updateUserData, patientId, profileName, apptTime);
  }

  return change.after.val();
});


/**
 * 
 * @param {*} location 
 * @param {*} patientId 
 * @param {*} profileName 
 * @param {*} updateUserData 
 */
async function updateExistingPatient(location, patientId, profileName, updateUserData, appt_time) {
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
  updateAppt(location, updateUserData);
}

/**
 * 
 * @param {*} location 
 * @param {*} updateUserData 
 * @param {*} patientId 
 * @param {*} profileName 
 * @param {*} apptTime 
 */
async function addNewPatient(location, updateUserData, patientId, profileName, apptTime) {
  var newPatientRef = await admin.database().ref(`${location}/patient_list`).push();
  var newPatientRefKey = newPatientRef.key;
  // first time a patient and profile is being added so add
  // created to profile
  updateUserData[`patient_list/${newPatientRefKey}`] = { patientId: patientId };
  updateUserData[`${patientId}/${profileName}/created`] = apptTime;
  updateAppt(location, updateUserData);
}

/**
 * 
 * @param {*} profile_name 
 * @param {*} appt_data 
 */
async function updateAppt(location, appt_data) {
  await admin.database().ref(location).update(appt_data, (error) => {
    if (error) {
      console.log('Unable to save new data for patient with patientId', patientId);
    }
  })
}
