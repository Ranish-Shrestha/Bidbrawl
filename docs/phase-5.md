# Phase 5 local variants

Phase 5 starts with local Live Auction and its optional Creator view. The hosted online Secret Bid check is tracked separately in the [deployment guide](online-multiplayer.md#deploy-and-verify).

## Live Auction rules

Both players share a device and see the current offer. The match uses a 12-card draw, $20 each, and five picks per player. A card stays hidden until either player chooses **Reveal Card**. Player 1 opens odd-numbered rounds and Player 2 opens even-numbered rounds. A full roster skips its turn.

- The opening offer is exactly $1. A challenger can raise by any whole-dollar amount above the current offer, up to `cash remaining − (open slots − 1)`. Raising hands the turn back to the other player. A player who cannot legally raise can still pass.
- Passing ends that player’s participation in the round. If a player passes against an existing offer, the leader wins and pays that offer. If the opener passes before any offer, the other eligible player can still buy for $1 or pass. If only one player is eligible, their $1 offer wins immediately.
- With no offer from either eligible player, discard the card if there are more cards left, including the current one, than open slots. Otherwise assign it for $1 to the player with more open slots. Equal slots use a separate assignment priority that starts with Player 1 and flips after it breaks a tie.
- Each outcome stays visible until **Next Card**. When both rosters fill, the last outcome leads to the showdown. The next card stays hidden until the players manually reveal it. Rematch keeps the category and player names and draws a fresh order.

Live Auction uses its own turn reducer and saved action history. It shares budget calculations and the no-bid assignment rule with Secret Bid.

## Creator view

Creator view is a local Live Auction layout with a 9:16 frame. It keeps the current card or mystery back, active player, visible offer, and both budgets in the central area, with space for platform overlays at the edges. Controls live below the capture frame. Players control reveal pacing. Finished matches can export replay metadata that records revealed cards, public raises, passes, and acquisitions. The export leaves out unrevealed cards, the shuffle seed, and local votes.

From the showdown, open **Replay Studio** to load the current finished auction, or choose a previously exported replay JSON file. The game checks the actions and outcomes against the auction rules and reconstructs each budget from the replay. Select a round, scrub the timeline, or use **Play Replay** to advance through the events.

Select the current round or full replay, choose **Create Video**, then **Save Video**. Export renders public events into a silent 540×960 canvas video on the device. It uses WebM when supported, with MP4 as a browser-dependent alternative. Keep the tab visible while encoding. Playback and JSON export remain available on browsers without an encoder. [Canvas capture specification](https://www.w3.org/TR/mediacapture-fromelement/) · [MediaRecorder specification](https://www.w3.org/TR/mediastream-recording/)

## Chaos playtest candidates

Chaos abilities remain experimental until paired human playtests confirm they are fun and fair. The first playtest should compare matches with the ability enabled and disabled, alternate seats, log blind-bid and assignment timing, and ask each player about loss of control and perceived fairness.

| Candidate | Timing, cost, and consent for the playtest |
| --- | --- |
| Poison Gift | Once per player, before bidding, gift the current revealed card to an opponent with an open slot for $1. Both players opt in before the match. The first valid gift in turn order settles the round. A rejected gift consumes nothing. |
| Blind Bid | Try in Secret Bid with both players opted in. Once per player, commit privately before the card is revealed. The usual protected maximum applies. A committed blind bid cannot change and is revealed together with the other bid. |
| Propose Swap | Once per player after resolution, offer one acquired item for one opponent item with the same paid price. The other player may accept or decline. No budget or slot count changes. The first outstanding proposal blocks further proposals until it is answered or the players continue. |

Before shipping an ability, verify that no sequence can violate protected budgets, acquire an item twice, fill a sixth slot, or exhaust the deck before both rosters finish. Record human feedback before enabling any ability in the app.
