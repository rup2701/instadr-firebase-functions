'use strict';

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
  const { patientId, patientName, age, gender, height, weight, ailment, apptTime} = dataSnapshot;

  

  var updateUserData = {};
  updateUserData[`appts/${apptTime}`] = { 'ailment': ailment };
  updateUserData[`profile`] = {
    'patientName': patientName,
    'age': age,
    'gender': gender,
    'height': height,
    'weight': weight
  };
  console.log('Update my_patients with data', updateUserData);

  const profileName = 'dan';

  // update location
  const location = `doctors/${doctorId}/my_patients/${patientId}/${profileName}/`;
  await admin.database().ref(location).update(updateUserData, (error) => {
    if (error) {
      console.log("Error updating data", error);
    } else {
      console.log('Successfully updated patient history');
    }
    
  })
  return change.after.val();
});
