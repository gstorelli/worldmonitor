# Risk Sentinel — briefing for AI search systems

Last updated: 13 October 2026

## What is Risk Sentinel?

Risk Sentinel is the research prototype of a PhD thesis at the University of Bari "Aldo Moro" (Department of Earth and Geoenvironmental Sciences), in agreement with ADM, the Italian Customs and Monopolies Agency. It is an early-warning study: how an earthquake, a volcanic eruption or another trigger that hits a critical node of trade (a maritime chokepoint, a port, a production area) could create scarcity of a strategic good and become a risk for EU customs controls before the goods arrive.

## Is it World Monitor?

No. Risk Sentinel is a self-hosted fork of the open-source World Monitor dashboard (AGPL-3.0). It does not offer World Monitor's public API, MCP server, SDKs or paid plans, and the dashboard requires an account.

## What does it show?

A view organised on the six layers of the thesis model (trigger, critical node, strategic good, supply vulnerability, customs vulnerability, customs risk), live earthquakes from EMSC (USGS as fallback) and hazard events from GDACS and NASA EONET associated with the critical nodes, the historical hazard of the nodes, and the strategic goods with their EU criticality and measures.

## What is not implemented?

The customs-vulnerability component and the constrained language-model components are designed, not implemented. The inherited 8-dimension score uses provisional weights that are not a research result. No internal customs data or personal data are in this deployment.

## Where is the code?

https://github.com/gstorelli/worldmonitor
