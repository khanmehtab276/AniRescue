const amqp = require("amqplib");

const QUEUE_NAME = "yolo_processing_queue";

let rabbitChannel = null;
let rabbitConnection = null;

// --------------------------------------------------
// RABBITMQ PRODUCER CONNECTION
// --------------------------------------------------
const connectRabbitMQ = async () => {
  let attempt = 0;

  while (!rabbitChannel) {
    try {
      attempt += 1;

      const rabbitUrl = process.env.RABBITMQ_URL;

      if (!rabbitUrl) {
        console.error("❌ RABBITMQ_URL is missing from environment variables.");
        process.exit(1);
      }

      console.log(`🔄 Connecting to RabbitMQ (attempt ${attempt})...`);

      rabbitConnection = await amqp.connect(rabbitUrl);

      rabbitChannel = await rabbitConnection.createChannel();

      await rabbitChannel.assertQueue(QUEUE_NAME, { durable: true });

      console.log(`✅ Connected to RabbitMQ Queue: ${QUEUE_NAME}`);

      rabbitConnection.on("error", (err) => {
        console.error("RabbitMQ connection error:", err?.message || err);

        rabbitChannel = null;
      });

      rabbitConnection.on("close", () => {
        console.warn("⚠️ RabbitMQ connection closed. Reconnecting in 5 seconds...");

        rabbitChannel = null;
        rabbitConnection = null;

        setTimeout(() => {
          if (!rabbitChannel) {
            connectRabbitMQ().catch((err) =>
              console.error("RabbitMQ reconnect error:", err),
            );
          }
        }, 5000);
      });

      break;
    } catch (err) {
      rabbitChannel = null;
      rabbitConnection = null;

      console.error(`RabbitMQ attempt ${attempt} failed:`, err?.message || err);

      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

const getChannel = () => rabbitChannel;

const closeRabbitMQ = async () => {
  if (rabbitChannel) await rabbitChannel.close();
  if (rabbitConnection) await rabbitConnection.close();
};

module.exports = { connectRabbitMQ, getChannel, closeRabbitMQ, QUEUE_NAME };
