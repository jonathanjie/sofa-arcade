# Tug of Yarn

## Rules

Tap on the beat to help your team pull the red yarn toward its line.
On each beat your team's pull is its unity multiplied by the timing accuracy of the taps that made that pull.
The stronger pull moves the knot toward that team, and the first team to reach its line wins the heat.
If neither team reaches its line in 38 seconds, the team that has pulled the knot onto its side wins, and a centered knot gives neither team a point.
The first team to win two heats takes the match, or the team with more heat wins takes it after three heats, with equal scores giving both teams a draw.

## Controls

- **Phone** · Tap anywhere on the Mint or Honey pad as the moving ring meets the center target. The pad shows **Perfect**, **Good**, or **Miss** immediately. Space and Enter also work when the pad has focus. The center target lights up in reduced motion.
- **TV** · Watch for the shared beat pulse and listen for the beat cue if effects are on. Look for your scarf, badge, and name on your team's bench. Each team has a unity meter and two heat indicators. The timer for the current heat is at the center.
- **Host** · Start from the party lobby. The three-second countdown precedes a match, and **Next round** starts a new best-of-three match.

## Scaling

The host sorts the locked roster by a seed-based order and assigns players to alternating teams. A team of three can pull as hard as a team of four with the same share of teammates tapping in time. The TV uses a second bench row when a team has more than four players. A held or removed seat still counts toward the team's original size for that match, and a guest who joins late can play in the next match. There are no mid-heat knockouts. Every connected player can keep pulling until the heat ends.

The authority accepts one in-window tap per player and beat. It picks the strongest group of taps that fit within one unity window. Unity is that group’s share of the locked team, and accuracy is the group’s mean tap quality. Integer pull arithmetic uses a common denominator for both teams, so equal pulls cancel even when their sizes differ. Each eligible player’s podium score is their team’s total heat wins.

## Tuning

| Setting | Value | Reason |
| --- | --- | --- |
| Heat and reset | 38 s per heat, 2 s between heats, 118 s simulation limit, 120 s host limit | The extra two seconds absorb normal scheduler drift so the final heat can score. An early line cross keeps a one-sided heat short. |
| Beat | 800 ms apart, dropping toward 550 ms in the final 10 s | A steady starting tempo is easy to follow. The shorter interval gives the trailer more chances to catch up. |
| First beat | 1,100 ms into each heat | Gives the TV and phones time to show the incoming beat after the start or reset. |
| Timing | Perfect within ±45 ms, Good through ±150 ms | Leaves room for a new player while rewarding taps near the cue. A Good tap tapers to 25% strength at the edge. |
| Unity | 110 ms between the first and last tap in the selected group | Gives the strongest pull when teammates hit together and limits the pull from scattered taps. |
| Line | Nine unanswered full-strength pulls from center | A sustained timing advantage can end the heat early. Each opposing pull buys time. |
| Delivery | Host waits 250 ms beyond the tap window and allows up to 100 ms of reported clock lead | Lets delayed taps count at their local timestamp while limiting how far in advance a tap can be submitted. |

The public beat schedule is shared by the host rules, TV, and phones. The phone probes the room lookup after it connects to estimate round-trip time, then aligns its monotonic clock to the least delayed of the five latest match snapshots. Taps carry elapsed match time. Wi-Fi delay within the delivery window does not reduce tap quality once the clocks are aligned. The current contract has no host send timestamp or clock probe, so an asymmetric connection or a host stall can still shift the initial estimate. A platform-provided timestamp exchange would improve that case. The party roster stays locked for the whole match under the current contract.
