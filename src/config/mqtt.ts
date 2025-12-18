import mqtt from 'mqtt';
import dotenv from 'dotenv';

dotenv.config();

// ============================================
// CONFIGURAZIONE MQTT PER TASMOTA
// ============================================

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';

let mqttClient: mqtt.MqttClient | null = null;

export const connectMQTT = () => {
  const options: mqtt.IClientOptions = {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    reconnectPeriod: 5000,
    connectTimeout: 30000
  };

  mqttClient = mqtt.connect(MQTT_BROKER, options);

  mqttClient.on('connect', () => {
    console.log('✅ MQTT connesso con successo');
    // Subscribe ai topic Tasmota
    mqttClient?.subscribe('stat/+/+', (err) => {
      if (err) console.error('❌ Errore subscribe MQTT:', err);
    });
  });

  mqttClient.on('error', (error) => {
    console.error('❌ Errore MQTT:', error);
  });

  mqttClient.on('message', (topic, message) => {
    // Handler messaggi MQTT - sarà gestito dal service
    console.log(`📨 MQTT: ${topic} - ${message.toString()}`);
  });

  return mqttClient;
};

export const getMQTTClient = () => {
  if (!mqttClient) {
    throw new Error('MQTT client non inizializzato');
  }
  return mqttClient;
};

// Funzioni helper per Tasmota
export const tasmotaCommand = (topic: string, command: string, value?: any) => {
  const client = getMQTTClient();
  const payload = value !== undefined ? JSON.stringify(value) : '';
  client.publish(`cmnd/${topic}/${command}`, payload);
};
