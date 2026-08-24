"""Constants for the ECHO integration."""

from __future__ import annotations

DOMAIN = "echo"
PLATFORMS = ["media_player"]

CONF_DEVICE_ID = "device_id"
CONF_TOPIC_PREFIX = "topic_prefix"
CONF_DEVICE_NAME = "device_name"

DEFAULT_TOPIC_PREFIX = "echo"
DEFAULT_DEVICE_NAME = "ECHO"
COMMAND_TIMEOUT_SECONDS = 8.0
