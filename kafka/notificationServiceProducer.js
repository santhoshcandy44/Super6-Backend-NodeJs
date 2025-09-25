const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: ['localhost:9092'],
});

const producer = kafka.producer();

async function sendLocalJobApplicantAppliedNotificationToKafka(kafkaKey, message) {
  try {
    console.log('Connecting to Kafka...');
    await producer.connect();
    console.log('Kafka connected.');
    const result = await producer.send({
      topic: 'local-job-application-notifications',
      messages: [{ key: kafkaKey, value: JSON.stringify(message) }],
    });
    console.log('Message sent:', result);
  } catch (error) {
    console.error('Kafka send failed:', error);
  } finally {
    await producer.disconnect();
    console.log('Kafka disconnected.');
  }
}

module.exports = { sendLocalJobApplicantAppliedNotificationToKafka };