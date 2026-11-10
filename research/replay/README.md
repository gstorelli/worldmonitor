# Retrospective replay (Year 2)

- `protocol.yaml`: parameters of the Year-2 protocol, **proposal v0.1, not frozen**. Human-readable version and rationale: `docs/protocollo-anno2.md` in the thesis repository. When the supervisors approve it, the commit is tagged `protocollo-anno2-v1` and nothing changes before the replay runs.
- `../../src/services/thesis/engine.ts`: the engine (layers L, H, S, C; formulations R0, F1, F2), pure and shared with the platform. Tests: `tests/thesis-engine.test.mts` (also checks that the engine defaults equal this YAML).
- `hualien-demo.mts`: demonstration on the Hualien earthquake of 2/4/2024. It is **not** the protocol replay: no disruption data and no metrics before the protocol is frozen.

```bash
npx tsx research/replay/hualien-demo.mts <outDir>
```

The raw catalogue and Comext answers are saved in `<outDir>/inputs/` with their SHA-256 and are not committed; derived outputs (`timeline.csv`, `summary.json`) go to `results/replay-demo/` of the thesis repository.
