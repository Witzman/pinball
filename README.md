# THE COLONY

A pinball game for the web browser. You play an ant colony in a cutaway of an underground nest, seen from above and a little tilted: shoot the ramps, feed the fungus, milk the aphids, and fly the new queen out at the end.

It runs in any modern browser with no install and no account. The ball physics, the rules and the table are original; so are the names, the art and the layout.

**Play:** the site is published from this repository with GitHub Pages (<https://witzman.github.io/pinball/>).

## How to play

A game costs one credit (three are given). Coin, buy-in and start are the three buttons along the top of the screen.

| | Keyboard | Touch |
|---|---|---|
| Left flipper | Left Shift, `Z`, Left arrow | left half of the lower screen |
| Right flipper | Right Shift, `/`, Right arrow | right half of the lower screen |
| Plunger | Space, Down arrow, Enter (hold, then release) | hold and release at the right edge |
| Coin, start, buy-in | `C`, `1`, `B` | the top buttons |
| Nudge left, right, up | `A`, `D`, `W` | the free upper part of the screen |
| Pause, mute | `P` or Esc, `M` | |

You get three balls. A ball the saver serves again does not cost a ball number. Nudging the table is allowed, but too much tilts it: the ball is dead, with no bonus and no saver. Between balls the bonus is counted. A good score earns a place on the high-score board, an extra ball is possible, and a replay is won at one billion points.

## The table

520 x 1050 mm, tilted 6.5 degrees, a 27 mm ball. From the drain upward:

- **Outlanes, inlanes and slingshots** at the bottom; the **left outlane has a kickback** (once per ball) that sends the ball back up.
- **Two lower flippers** and **two upper flippers** (one on each wall) for the upper shots.
- **Leaf Ramp** (left) and **Root Ramp** (right): plastic ramps that carry the ball up and out at the top.
- **Brood Chamber, Queen's Chamber and Mushroom Hole**: sinkholes that catch the ball, pay, and let it go again after a moment.
- **Fungus Farm**: two banks of three drop targets either side of the Mushroom Hole. Drop a whole bank for a bonus; the targets come back up.
- **Aphid Pasture**: three pop bumpers.
- **Trail West and Trail East**: the two side orbits, each with a spinner.
- **Pheromone Loop**: the loop under the dome, left to right.
- **Dig Ramp and Dig Site**: a steep ramp at the upper right into a pit. The **Pull Bridge** magnet holds the ball at the upper flipper after a Leaf Ramp shot so the Dig Ramp can be shot cleanly.
- **Scout**: a standup target at the centre.
- **Rollover lanes** (W, O, R) and the **skill-shot lanes** in the plunger lane.

## The rules

**In the game today**

- **Skill shot:** one of the three plunger-lane lanes lights at the start of each ball. Reach it before the ball touches anything else for 1,000,000. Running all three lanes in order is the **super skill shot**, 10,000,000.
- **Ramps, orbits and loop:** a Leaf or Root Ramp shot pays 100,000; the orbits (past their spinner) pay 100,000 and the Pheromone Loop 150,000.
- **Chambers:** Brood, Queen's, Mushroom and the Dig Site each pay when they catch the ball.
- **Fungus Farm:** every target pays; the third of a bank pays the bank bonus of 250,000.
- **Pheromone Trail:** two or more different trail shots in a row (Trail West, Leaf Ramp, Pheromone Loop, Root Ramp, Trail East), each within six seconds of the one before, build a trail: Trail, Double, Triple, Super. Each shot pays more the longer the trail. Every trail adds one scent, which lasts the whole game.
- **Flashing lamps** show what is open right now; lit lamps show what is waiting.

**Planned** (the design is in the workshop repository; none of it is playable yet)

- **Colony Level** (1 to 8), raised by the spinners, with awards from small points up to a Brood Egg.
- **Six timed missions**, about 45 seconds each, each giving an egg: Forage, Flood Rescue, Wasp Defense, Tunnel Dig, Aphid Milking and Fungus Garden. Finish all six for **Colony Complete**.
- **Hurry-ups and modes:** Scout Report, Harvest, **Scent Storm** (all trail shots lit after enough trails). The trail length becomes a multiplier for the next mode.
- **Multiballs**, and a bonus counted from loops, colony levels, trails and eggs.

All point values are placeholders until the game has been played enough to tune them.

## Run it yourself

You need Node.js.

```
npm install
npm run dev        # a local server with live reload
npm test           # the test suite
npm run typecheck
npm run build      # a static site in dist/
npm run budget     # checks the download size limits
```

The game is deterministic: a fixed 1 ms physics step, a seeded random generator, and recorded games can be replayed exactly. The table is plain data (`src/tables/colony.ts`), the rules are a small script over switch and shot events (`src/tables/colony-rules.ts`), and the 3D view (PlayCanvas, with a plain canvas fallback) only reads snapshots of the game and never changes it.

## Changelog

Newest first. A short summary of what was added, no details.

- **Playfield art v4:** soil texture on the ramp strips, orbit corridors, target banks and lamp area.
- **Flashing lamps:** a flash state in the rules; the open skill-shot lane blinks in the 3D view.
- **Ball reflections:** the ball reflects warm soil instead of a blue-grey floor.
- **Pheromone Trail:** the combo rule with Trail, Double, Triple, Super and a lasting scent counter.
- **Nudge shake:** the 3D view shakes when you nudge the table.
- **Drop targets in 3D:** hit targets sink and come back up.
- **Photorealistic playfield and ramp plastic:** the painted table became a photographic cutaway; ramps got printed plastic.
- **Orbits, spinners, loop and upper right flipper** on the Colony.
- **Fungus Farm and the kickback.**
- **Dig Ramp, Dig Site and the Pull Bridge magnet.**
- **Brood, Queen's and Mushroom chambers**, and the drain gap fixed.
- **Leaf and Root Ramps** that carry the ball up.
- **Layout checks:** a lint for hand-made tables and a check that no ball can rest anywhere on the table.
- **Drop targets, kickers and upper flippers** in the physics engine.
- **Audio part 1:** the table sounds.
- **3D renderer:** a lit PlayCanvas table in a cabinet with a backbox and display, rising ramps, effects, and a fallback to the plain canvas.
- **The Colony table:** outline, bumpers, slingshots, the Scout, rollovers, and the scoring scale.
- **Nudge and tilt.**
- **Game flow:** credits, three balls, ball saver, bonus, extra ball, buy-in, high scores, replay, and the page deployed on GitHub Pages.
- **Rules engine:** lamps, counters, timers, shots, modes, and a harness for replaying recorded games.
- **Physics engine:** deterministic ball, walls, posts, flippers, plunger, one-way gates, triggers and sinkholes, magnets.
