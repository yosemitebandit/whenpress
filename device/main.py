"""WhenPress device.

Target is Sparkfun's Xbee LTE-M/NB-IOT dev kit
with an attached Sparkfun qwiic button
and a Sparkfun qwiic RTC.

1. when button is pressed, store timestamp.
2. periodically send all stored events to cloud.
3. periodically send a ping to the cloud.
"""

import time

import ujson
import usocket

# Use digi studio to copy lib/* -> /flash/lib/
import credentials
import micropython_i2c
import qwiic_button
import qwiic_rtc
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
# Init this asap so we can start capturing button presses.
i2c_driver = micropython_i2c.MicroPythonI2C()
qbutton = qwiic_button.QwiicButton(address=None, i2c_driver=i2c_driver)
print("qwiic button: starting.")
while not qbutton.begin():
    print("qwiic button: failed to init, retrying..")
    time.sleep(5)
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

# Start the Qwiic RTC.
qrtc = qwiic_rtc.QwiicRTC(address=0x32, i2c_driver=i2c_driver)
print("qwiic rtc: starting")
while not qrtc.begin():
    print("qwiic rtc: failed to init, retrying..")
    time.sleep(5)
print("qwiic rtc: ready")

BASE_URL = "https://whenpress.net"
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
# TODO: could remove this as we no longer need tz_offset
while True:
    try:
        time.tz_offset()
        print("clock boostrap: ready.")
        break
    except OSError:
        print("clock bootstrap: waiting..")
        time.sleep(5)

# Xbee uses 1/1/2000 as epoch start instead of 1/1/1970.
# To create a more typical UTC timestamp indexed from 1970,
# we can add the delta in seconds.
EPOCH_DIFFERENCE = 946684800
events = []
last_ping = -PING_PERIOD * 1000  # init so the ping triggers on boot

# Main loop.
print("device: ready.")
print("device: starting main loop.")
while True:
    # Check for button presses on qwiic button.
    try:
        while not qbutton.is_clicked_queue_empty():
            # The button's queue has millisecond values in it. After some
            # testing, this is the time relative to the first time in the
            # queue. Unfortunately it's not the time since boot.
            # TODO: is there a better way to handle the queue times? E.g. if
            # we accumulate presses while we are stuck transmitting.
            # In most cases this will be fine, we won't be stuck long.
            # Ensure that we're dealing with ints; the xbee's micropython
            # fp math was surprising!
            events.append(
                {
                    "pressTimestamp": sum(
                        (
                            int(qrtc.get_epoch_time()),
                            int(qbutton.pop_clicked_queue() / 1000.0),
                            EPOCH_DIFFERENCE,
                        )
                    )
                }
            )
            # Sleep to give the i2c bus a rest.
            time.sleep(0.1)
    except OSError as e:
        print("error: " + str(e))

    # Pop off individual events and transmit them.
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
        success = http_post(
            url=BASE_URL + "/" + credentials.device_name + "/ping",
            headers=HEADERS,
            data={
                "password": credentials.password,
            },
        )
        if success:
            last_ping = time.ticks_ms()

    # Pause to give the i2c bus a rest.
    time.sleep(0.1)
