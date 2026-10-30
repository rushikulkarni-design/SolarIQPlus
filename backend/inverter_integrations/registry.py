"""
Central registry for SolarIQ+ inverter providers.
"""

from typing import Dict, Iterable

from .base import InverterProvider


class InverterRegistry:
    def __init__(self) -> None:
        self._providers: Dict[str, InverterProvider] = {}

    def register(self, provider: InverterProvider) -> None:
        provider_id = provider.provider_id.strip().lower()

        if not provider_id:
            raise ValueError("Provider ID cannot be empty.")

        if provider_id in self._providers:
            raise ValueError(
                f"Inverter provider '{provider_id}' is already registered."
            )

        self._providers[provider_id] = provider

    def get(self, provider_id: str) -> InverterProvider:
        key = provider_id.strip().lower()
        provider = self._providers.get(key)

        if provider is None:
            raise KeyError(
                f"Inverter provider '{provider_id}' is not registered."
            )

        return provider

    def has(self, provider_id: str) -> bool:
        return provider_id.strip().lower() in self._providers

    def all(self) -> Iterable[InverterProvider]:
        return self._providers.values()

    def ids(self) -> list[str]:
        return list(self._providers.keys())

    def capabilities(self) -> Dict[str, object]:
        return {
            provider.provider_id: provider.capabilities
            for provider in self._providers.values()
        }
