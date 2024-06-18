"""WhenPress device.

1. When button is pressed, (TODO) store timestamp.
2. TODO: Periodically send all stored events to cloud.
3. TODO: Periodically send a ping to the cloud if there are no events.

potential optimizations
- use qwiic button
- use external rtc
- event persistence survives device reboot
- don't send ping if we sent events recently
- send battery info
"""

import time

import machine
import usocket

# import urequests
# import utime

print("whenpress.")
led = machine.Pin("D4", machine.Pin.OUT)
button = machine.Pin("D0", machine.Pin.IN, machine.Pin.PULL_UP)

# url = "https://whenpress.matt-ball-2.workers.dev/sage/ping"
# headers = {"Content-Type": "application/json"}
# data = {}
# response = urequests.post(url, headers=headers, data=data)
# print(response.text)


def is_connected():
    try:
        usocket.getaddrinfo("8.8.8.8", 53)
        return True
    except:
        return False


# Wait for connectivity.
# The Xbee retrieves local time from the cell network.
# Using this in isolation is not ideal --
# we might want to record a button press before we've established connectivity.
# TODO: leverage "time since last reset" in combination with network time.
while True:
    if is_connected():
        print("cell network connection: ready.")
        break
    else:
        print("cell network connection: waiting..")
        time.sleep(5)

# Wait for clock to be set.
while True:
    try:
        time.tz_offset()
        print("clock boostrap: ready.")
        break
    except OSError:
        print("clock bootstrap: waiting..")
        time.sleep(5)

# Xbee uses 1/1/2000 as epoch.
# We can add this value and the tzoffset to create a UTC timestamp.
epoch_difference = 946684800 + time.tz_offset()
button_being_pressed = False
events = []


# Record button press events.
while True:
    if button.value() == 0:  # when pressed, button is pulled low
        if not button_being_pressed:
            events.append({"pressTimestamp": time.time() + epoch_difference})
            print("events:" + str(events))
            button_being_pressed = True
            led.toggle()
    else:
        button_being_pressed = False
