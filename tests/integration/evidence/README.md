# Acceptance evidence

Rendered acceptance writes PNG screenshots and a JSON report here. CI should
upload this directory even when a test fails so the failing viewport can be
reviewed. Never commit browser profiles, database files, response traces carrying
credentials, or storage state.

The JSON report records the source commit and any dirty tracked paths at the
time of the run. Evidence from a dirty working tree is provisional. Final release evidence must identify the exact tested commit. See the [release checks](../../../docs/LOCAL_RELEASE.md) and the [archived integration report](../../../docs/archive/workstreams/integration.md) for earlier results.

No placeholder images count as rendered acceptance. A browser screenshot does
not establish native Mac execution or physical-device behavior.
