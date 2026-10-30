class InverterError(Exception):
    """Base exception for SolarIQ+ inverter integrations."""

class InverterConnectionError(InverterError):
    """The inverter or gateway could not be reached."""

class InverterTimeoutError(InverterConnectionError):
    """The inverter did not respond within the timeout."""

class InverterProtocolError(InverterError):
    """The device response/protocol data was invalid."""

class InverterNotSupportedError(InverterError):
    """The requested inverter/protocol capability is unsupported."""
