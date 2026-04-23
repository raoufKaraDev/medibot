"""MQTT client (paho) and live robot state."""
import json
import time
from typing import Any
import os
import paho.mqtt.client as mqttclient

from config import MQTT_HOST, MQTT_PORT, TOPIC_CMD
from database import get_db
_mqtt_client = None
robot_state: dict[str, Any] = {
    "esp32": "unknown",
    "stm32": "unknown",
    "last_rfid_scan": None,
    "last_dispense": None,
    "last_status_payload": None,
}
TOPIC_STATUS = "robot/ROBOT001/status"
TOPIC_RFID = "robot/ROBOT001/rfid"
TOPIC_ACK = "robot/ROBOT001/ack"

_mqtt = None


def _on_mqtt_message(client, userdata, msg):
    global robot_state
    try:
        topic = msg.topic
        payload_s = msg.payload.decode("utf-8", errors="replace")
        ts = time.strftime("%Y-%m-%d %H:%M:%S")
        conn = get_db()
        try:
            conn.execute(
                "INSERT INTO events(timestamp, source, topic, payload) VALUES (?,?,?,?)",
                (ts, "mqtt", topic, payload_s),
            )
            conn.commit()
        finally:
            conn.close()
        if topic == TOPIC_STATUS:
            robot_state["last_status_payload"] = payload_s
            try:
                data = json.loads(payload_s)
                esp = str(data.get("esp32", "unknown")).lower()
                robot_state["esp32"] = esp if esp in ("online", "offline") else "unknown"
                st = str(data.get("stm32", "unknown")).lower()
                if st in ("ready", "busy", "offline"):
                    robot_state["stm32"] = st
                elif st == "online":
                    robot_state["stm32"] = "ready"
                else:
                    robot_state["stm32"] = "unknown"
            except Exception:
                pass
        elif topic == TOPIC_RFID:
            robot_state["last_rfid_scan"] = ts
        elif topic == TOPIC_ACK:
            robot_state["last_dispense"] = ts
    except Exception as e:
        print(f"[MQTT] message handler: {e}")


def mqtt_on_connect(client, userdata, flags, reason_code, properties=None):
    print(f"[MQTT] Connect rc={reason_code}")
    client.subscribe([(TOPIC_STATUS, 1), (TOPIC_RFID, 1), (TOPIC_ACK, 1)])


def setup_mqtt_client():
    global _mqtt
    if _mqtt and _mqtt.is_connected():
        return _mqtt
    c = mqttclient.Client(mqttclient.CallbackAPIVersion.VERSION2, client_id=f"medibot-backend-{os.getpid()}")
    c.on_connect = mqtt_on_connect
    c.on_message = _on_mqtt_message
    c.on_disconnect = lambda cl, u, df, rc, p=None: print(f"[MQTT] Disconnect rc={rc}")
    c.on_publish = lambda cl, u, mid, rc=None, p=None: print(f"[MQTT] Published mid={mid}")
    c.reconnect_delay_set(1, 10)
    try:
        c.connect(MQTT_HOST, MQTT_PORT, keepalive=60)
        c.loop_start()
        _mqtt = c
    except Exception as e:
        print(f"[MQTT] Connection failed: {e}")
    return c


def get_mqtt():
    return setup_mqtt_client()


def mqtt_publish(payload: dict) -> bool:
    try:
        r = get_mqtt().publish(TOPIC_CMD, json.dumps(payload, ensure_ascii=False), qos=1)
        r.wait_for_publish(timeout=5.0)
        return r.is_published()
    except Exception as e:
        print(f"[MQTT] Publish error: {e}")
        return False