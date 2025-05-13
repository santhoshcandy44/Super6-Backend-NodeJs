const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

async function sendLocalJobApplicantAppliedNotificationToKafka(local_job_id,
  user_id, applicant_id, message) {
  const kafkaKey = `${local_job_id}:${user_id}:${applicant_id}`
  await producer.connect();
  await producer.send({
    topic: 'local-job-application-notifications',
    messages: [{ key: kafkaKey, value: JSON.stringify(message) }],
  });
  await producer.disconnect();
}

module.exports = { sendLocalJobApplicantAppliedNotificationToKafka };
