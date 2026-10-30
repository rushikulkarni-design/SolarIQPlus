"""
Registry for universal/local inverter adapters.

This registry manages protocol-based adapters such as:

- SunSpec Modbus
- Modbus RTU
- Modbus TCP
- Manufacturer gateways
- Other local inverter integrations

Cloud providers such as Enphase remain managed by InverterRegistry.
"""

from typing import Dict, Iterable

from .adapter import InverterAdapter


class InverterAdapterRegistry:
    """
    Central registry for universal inverter adapters.
    """

    def __init__(self) -> None:
        self._adapters: Dict[str, InverterAdapter] = {}

    def register(self, adapter: InverterAdapter) -> None:
        """
        Register a universal inverter adapter.
        """

        adapter_id = adapter.adapter_id.strip().lower()

        if not adapter_id:
            raise ValueError("Adapter ID cannot be empty.")

        if adapter_id in self._adapters:
            raise ValueError(
                f"Inverter adapter '{adapter_id}' is already registered."
            )

        self._adapters[adapter_id] = adapter

    def get(self, adapter_id: str) -> InverterAdapter:
        """
        Get an adapter by ID.
        """

        key = adapter_id.strip().lower()

        adapter = self._adapters.get(key)

        if adapter is None:
            raise KeyError(
                f"Inverter adapter '{adapter_id}' is not registered."
            )

        return adapter

    def has(self, adapter_id: str) -> bool:
        """
        Check whether an adapter is registered.
        """

        return adapter_id.strip().lower() in self._adapters

    def all(self) -> Iterable[InverterAdapter]:
        """
        Return all registered adapters.
        """

        return self._adapters.values()

    def ids(self) -> list[str]:
        """
        Return all registered adapter IDs.
        """

        return list(self._adapters.keys())

    def capabilities(self) -> Dict[str, object]:
        """
        Return capabilities for all registered adapters.
        """

        return {
            adapter.adapter_id: adapter.capabilities
            for adapter in self._adapters.values()
        }