const { Kafka } = require('kafkajs');
const db = require('../config/database.js')
const { sendFCMNotification, decodeFCMToken } = require('../utils/fcmUtils.js');
const User = require('../models/User.js');
const { PROFILE_BASE_URL } = require('../config/config.js');
const kafka = new Kafka({ clientId: 'notification-service', brokers: ['localhost:9092'] });
const consumer = kafka.consumer({ groupId: 'notification-group' });

async function startLocalJobNotificationsConsumer() {
  await consumer.connect();
  console.log("Kaka: startLocalJobNotificationsConsumer started running")
  await consumer.subscribe({ topic: 'local-job-application-notifications', fromBeginning: false });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const { user_id, candidate_id, applicant_id, local_job_title } = JSON.parse(message.value.toString());
      const connection = await db.getConnection();
      await connection.beginTransaction();

      const [results] = await connection.execute(`
          SELECT fcm_token FROM fcm_tokens WHERE user_id = ?
      `, [user_id]);


      await connection.commit();
      const result = await User.getUserProfile(candidate_id)

      if (results?.[0]?.fcm_token && result) {

        const date = new Date(result.created_at);
        const createdAtYear = date.getFullYear().toString();


        const data = {
          applicant_id: applicant_id,
          local_job_title: local_job_title,
          user: {
            user_id: user_id,
            first_name: result.first_name,
            last_name: result.last_name,
            about: result.about,
            email: result.email,
            is_email_verified: Boolean(result.is_email_verified),
            country_code: result.country_code,
            phoneNumber: result.phone_number,
            is_phone_verified: !!result.is_phone_verified,
            profile_pic_url: PROFILE_BASE_URL + "/" + result.profile_pic_url,
            profile_pic_url_96x96: PROFILE_BASE_URL + "/" + result.profile_pic_url_96x96,
            account_type: result.account_type,
            location: result.latitude == null || result.longitude == null ? null : {
              latitude: result.latitude,
              longitude: result.longitude,
              geo: result.geo,
              location_type: result.location_type,
              updated_at: result.updated_at,
            },
            created_at: createdAtYear,
            updated_at: result.profile_updated_at,
          },

        }

        console.log("4");

        const decodedFCMToken = decodeFCMToken(results[0].fcm_token)
        await sendFCMNotification(`business_local_job_application:${user_id}:${applicant_id}`, decodedFCMToken, "business_local_job_application", "Someone applied local job", JSON.stringify(data));

      }
    },
  });
}

startLocalJobNotificationsConsumer()