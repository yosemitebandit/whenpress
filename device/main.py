"""WhenPress device.

1. When button is pressed, (TODO) store timestamp from RTC.
2. TODO: Periodically send all stored events to cloud.
3. TODO: Periodically send a ping to the cloud if there are no events.

potential optimizations
- event persistence survives device reboot
- don't send ping if we sent events recently
- send battery info
"""

import machine

# import utime

# import urequests
# import usocket

led = machine.Pin("D4", machine.Pin.OUT)
button = machine.Pin("D0", machine.Pin.IN, machine.Pin.PULL_UP)

# url = "https://whenpress.matt-ball-2.workers.dev/sage/ping"
# headers = {"Content-Type": "application/json"}
# data = {}


# def is_connected():
#     try:
#         usocket.getaddrinfo("8.8.8.8", 53)
#         return True
#     except:
#         return False


print("whenpress.")
button_being_pressed = False


while True:
    if button.value() == 0:  # when pressed, button is pulled low
        if not button_being_pressed:
            print("button")
            button_being_pressed = True
            led.toggle()
    else:
        button_being_pressed = False


# while True:
# while not is_connected():
#    print("awaiting connection..")
#    time.sleep(5)

# print("posting")
# led.on()
# response = urequests.post(url, headers=headers, data=data)
# print(response.text)
# print("waiting")
# led.off()
# time.sleep(30)
