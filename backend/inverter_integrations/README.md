# SolarIQ+ Inverter Integration Architecture

## Purpose

This is the provider-agnostic foundation for real inverter/solar
monitoring integrations.

It deliberately does **not** contain fake manufacturer APIs or
invented credentials.

## Architecture

```text
SolarIQ+ Frontend
       |
       v
Inverter Integration API
       |
       v
Inverter Registry
       |
       +-------------------+
       |                   |
       v                   v
Manufacturer Adapter   Local Gateway Adapter
       |                   |
       v                   v
Official Cloud API      Modbus / LAN / Gateway
       |
       v
Provider Raw Data
       |
       v
Normalization Layer
       |
       v
SolarIQ+ Common Models
       |
       +--------+---------+---------+
       |        |         |         |
       v        v         v         v
Dashboard  Analytics  AI/Alerts  Reports
```

## Required provider contract

Every production connector implements:

- authorization
- callback/token handling
- connection revocation
- system discovery
- realtime telemetry
- historical energy
- alarms
- system/inverter details

## Security rule

OAuth access/refresh tokens and API secrets stay server-side.
They must never be stored in React/localStorage or returned to the
browser.

## Data modes

The architecture supports:

- `real` — verified provider data
- `demo` — clearly labelled synthetic/demo data

Demo data must never be presented as real customer telemetry.

## Next implementation step

Add the existing Enphase connector as the first concrete adapter
behind this interface. After that, add additional providers only
after verifying their official production integration mechanism.
