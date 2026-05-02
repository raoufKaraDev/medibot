export type Environment = 'LOCALHOSPITAL' | 'REMOTEBACKUP';

export interface AppConfig {
  environment: Environment;
  apiBaseUrl: string;
  apiPort: number;
  mqttEnabled: boolean;
  mqttBroker?: string;
  sessionTimeoutMinutes: number;
  authPolicy: 'LOCAL' | 'REMOTESTRONG';
}

const getEnvironment = (): Environment =>
  (import.meta.env.VITE_ENVIRONMENT as Environment) || 'LOCALHOSPITAL';

const getApiBaseUrl = (): string => {
  const env = getEnvironment();
  if (env === 'LOCALHOSPITAL') {
    return (
      import.meta.env.VITE_API_BASE_URL ||
      `http://${window.location.hostname}:8000`
    );
  }
  return (
    import.meta.env.VITE_API_BASE_URL ||
    'https://medibot-backup.example.com'
  );
};

const env = getEnvironment();

export const appConfig: AppConfig = {
  environment: env,
  apiBaseUrl: getApiBaseUrl(),
  apiPort: parseInt(import.meta.env.VITE_API_PORT || '8000', 10),
  mqttEnabled: env === 'LOCALHOSPITAL',
  mqttBroker:
    env === 'LOCALHOSPITAL'
      ? import.meta.env.VITE_MQTT_BROKER || 'localhost'
      : undefined,
  sessionTimeoutMinutes: env === 'LOCALHOSPITAL' ? 30 : 60,
  authPolicy: env === 'LOCALHOSPITAL' ? 'LOCAL' : 'REMOTESTRONG',
};

export default appConfig;
