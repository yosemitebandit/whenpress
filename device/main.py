"""WhenPress device.

Target is Sparkfun's Xbee LTE-M/NB-IOT dev kit
with an attached Sparkfun qwiic button.

1. when button is pressed, store timestamp.
2. periodically send all stored events to cloud.
3. periodically send a ping to the cloud.
"""

import time

import machine
import ujson
import usocket

# Use digi studio to copy lib/* -> /flash/lib/
import credentials
import micropython_i2c
import qwiic_button
import urequests


print(
    """
                   __
         _      __/ /_  ___  ____  ____  ________  __________
        | | /| / / __ \/ _ \/ __ \/ __ \/ ___/ _ \/ ___/ ___/
        | |/ |/ / / / /  __/ / / / /_/ / /  /  __(__  |__  )
        |__/|__/_/ /_/\___/_/ /_/ .___/_/   \___/____/____/
                               /_/
      """
)
print("device: " + credentials.device_name)

# Start qwiic button.
# We want to init this asap so we can start capturing button presses.
xbee_mp_driver = micropython_i2c.MicroPythonI2C()
qbutton = qwiic_button.QwiicButton(address=None, i2c_driver=xbee_mp_driver)
print("qwiic button: starting.")
while not qbutton.begin():
    print("qwiic button: failed to init, retrying..")
    time.sleep(5)
ticks_since_qbutton_start = time.ticks_ms()
print("qwiic button: ready.")
while True:
    try:
        print("qwiic button: fw version: " + str(qbutton.get_firmware_version()))
        time.sleep(0.1)  # Give the i2c bus a break.
        qbutton.LED_off()
        break
    except OSError as e:
        print("qbutton: error: " + str(e))
        time.sleep(0.1)

BASE_URL = "https://whenpress.matt-ball-2.workers.dev"
HEADERS = {"Content-Type": "application/json"}
PING_PERIOD = 5 * 60


def is_radio_connected():
    try:
        usocket.getaddrinfo("8.8.8.8", 53)
        return True
    except:
        return False


def http_post(url, headers, data):
    """Wraps urequests.post.

    Returns boolean indicating success.
    """
    print("http post: " + str(url))
    try:
        response = urequests.post(
            url,
            headers=headers,
            data=ujson.dumps(data),
        )
    except (OSError, IndexError) as e:
        print("http post: exception: " + str(e))
        return False
    if response.status_code == 200:
        print("http post: success")
        return True
    else:
        print("http post: failed")
        print("http post: response status code: %s" % response.status_code)
        print("http post: response reason: %s" % response.reason)
        print("http post: response text: %s" % response.text)
        return False


# Block until we have connectivity.
while True:
    if is_radio_connected():
        print("network connection: ready.")
        break
    else:
        print("network connection: waiting..")
        time.sleep(5)

# Wait for clock setup.
# I believe the cell modem needs to connect and bootstrap the Xbee's clock.
# The time.tz_offset method fails unless you wait about 15s after boot.
while True:
    try:
        time.tz_offset()
        print("clock boostrap: ready.")
        break
    except OSError:
        print("clock bootstrap: waiting..")
        time.sleep(5)

# Determine the qbutton start timestamp.
# Now that the cell radio has provided localtime, we can convert from time-since-boot to time-since epoch.
ticks_since_boot = time.ticks_ms()
qbutton_start_time = (
    time.mktime(time.localtime())
    - ticks_since_boot / 1000.0
    + ticks_since_qbutton_start / 1000.0
)

# Xbee uses 1/1/2000 as epoch start instead of 1/1/1970.
# To create a more typical UTC timestamp indexed from 1970,
# we can add the delta in seconds and the tzoffset.
EPOCH_DIFFERENCE = 946684800 + time.tz_offset()
events = []
last_ping = -PING_PERIOD * 1000  # init so the ping triggers on boot

# Main loop.
print("whenpress: ready.")
print("device time: " + str(time.localtime()))
while True:
    # Check for button presses on qwiic button.
    try:
        while not qbutton.is_clicked_queue_empty():
            qbutton_timer_value = qbutton.pop_clicked_queue() / 1000.0
            events.append(
                {
                    "pressTimestamp": (
                        qbutton_start_time + qbutton_timer_value + EPOCH_DIFFERENCE
                    )
                }
            )
    except OSError as e:
        print("qbutton: error: " + str(e))

    # Pop off events and transmit them.
    # If transmission fails, add the event back into the queue.
    if events:
        print("event tx: event count: %s" % len(events))
        event = events.pop(0)
        print("event tx: sending one event")
        success = http_post(
            url=BASE_URL + "/" + credentials.device_name + "/data",
            headers=HEADERS,
            data={
                "password": credentials.password,
                "pressTimestamp": event["pressTimestamp"],
            },
        )
        if not success:
            events.append(event)

    # Periodically send a ping.
    if time.ticks_diff(time.ticks_ms(), last_ping) > (PING_PERIOD * 1000):
        print("ping: sending")
        http_post(
            url=BASE_URL + "/" + credentials.device_name + "/ping",
            headers=HEADERS,
            data={
                "password": credentials.password,
            },
        )
        last_ping = time.ticks_ms()

    # Pause to give the i2c bus a rest.
    time.sleep(0.1)
