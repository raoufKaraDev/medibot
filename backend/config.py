import os
import time

MQTT_HOST = os.getenv("MQTT_HOST", "127.0.0.1")
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_WS_PORT = int(os.getenv("MQTT_WS_PORT", "9001"))
TOPIC_CMD = "robot/ROBOT001/cmd/dispense"
DB_PATH = "medibot.db"
APP_START = time.time()
