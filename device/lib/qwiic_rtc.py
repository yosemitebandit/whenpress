"""Micropython driver for Sparkfun's QwiicRTC (RV-8803)."""


class QwiicRTC(object):
    # Registers.
    HUNDREDTHS = 0x10
    SECONDS = 0x11
    MINUTES = 0x12
    HOURS = 0x13
    WEEKDAY = 0x14  # 1 is Sunday
    DATE = 0x15  # day of month
    MONTH = 0x16
    YEAR = 0x17

    def __init__(self, i2c_driver, address=0x32):
        self.address = address
        self._i2c = i2c_driver

    def is_connected(self):
        """Determine if a Qwiic RTC device is connected to the system."""
        return self._i2c.isDeviceConnected(self.address)

    def begin(self):
        """Initialize the RTC.

        Run is_connected() and send a test read to a register.

        Returns True if the intialization was successful, otherwise False.
        """
        if self.is_connected() is True:
            # TODO: handle successful read of zero
            hundredths = self._i2c.readByte(self.address, self.HUNDREDTHS)
            if hundredths:
                return True
        return False

    def get_unix_time(self):
        """Return a unix timestamp.

        WIP.
        """
        # Read N bytes starting at the HUNDREDTHS register.
        # The next 8 register represent the rest of the date and time.
        [_, seconds, minutes, hours, _, date, month, year] = [
            self.bcd_to_dec(v)
            for v in self._i2c.read_block(self.address, self.HUNDREDTHS, 8)
        ]
        print(seconds, minutes, hours, date, month, year)
        # TODO: convert.
        return 0

    def set_time(self, seconds, minutes, hours, date, month, year):
        """Set RTC.

        Hours should be in 24hr format. Year should be four digit.
        """
        values = [
            seconds,
            minutes,
            hours,
            1 << 0,  # TODO: weekday
            date,
            month,
            (year - 2000),
        ]
        self._i2c.write_block(
            self.address,
            self.SECONDS,
            [self.dec_to_bcd(v) for v in values],
        )
        # TODO: some docs say "Set RESET bit to 0 after setting time
        # "so seconds don't get stuck."
        return 0

    def bcd_to_dec(self, value):
        """Convert BCD to Decimal."""
        return ((value // 0x10) * 10) + (value % 0x10)

    def dec_to_bcd(self, value):
        """Convert Decimal to BCD."""
        return ((value // 10) * 0x10) + (value % 10)
