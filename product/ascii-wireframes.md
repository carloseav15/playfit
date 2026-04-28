# ASCII Wireframes

## Goal

Translate the wireframe spec into low-fidelity layouts that are concrete enough to move into visual design.

These are desktop-first wireframes. They define:

- hierarchy
- spacing logic
- content grouping
- primary and secondary actions

## Screen 1: Landing

```text
+--------------------------------------------------------------------------------------------------+
| LOGO                                                                                 Sign in     |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Stop choosing games for prestige.                                                               |
|  Start choosing games that actually fit you.                                                     |
|                                                                                                  |
|  A personal taste engine that helps you decide what to continue, what to play next,             |
|  and what to avoid even if it looks attractive.                                                  |
|                                                                                                  |
|  [ Build my profile ]   [ See how it works ]                                                     |
|                                                                                                  |
|  ----------------------------------------------------------------------------------------------  |
|  Continue                         Next up                    Avoid for now                        |
|  Kingdom Hearts III              Chrono Trigger             Bayonetta 3                          |
|  Current run with momentum       Strong story fit           Stylish but risky for you            |
|  ----------------------------------------------------------------------------------------------  |
|                                                                                                  |
|                                  Explainable recommendations                                     |
|                                  built from your taste, not public hype.                         |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 2: Platform Setup

```text
+--------------------------------------------------------------------------------------------------+
| Step 1 of 4                                                                                      |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Where do you play?                                                                              |
|  We use this to avoid recommending games you can't actually access.                              |
|                                                                                                  |
|  Your current platforms                                                                          |
|                                                                                                  |
|  [x] PlayStation 5              Status: [ Available v ]                                          |
|  [x] Xbox Series X|S            Status: [ Available v ]                                          |
|  [x] Nintendo Switch            Status: [ Available v ]                                          |
|  [ ] Nintendo Switch 2          Status: [ Planned v   ]                                          |
|  [x] PC                         Status: [ Limited v   ]                                          |
|                                                                                                  |
|  Legacy platforms                                                                                |
|                                                                                                  |
|  [x] PlayStation                [x] PSP                [x] Game Boy Advance                      |
|  [x] Nintendo DS                [x] Nintendo 3DS                                                 |
|                                                                                                  |
|                                                             [ Skip for now ] [ Continue ]        |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 3: Taste Anchors

```text
+--------------------------------------------------------------------------------------------------+
| Step 2 of 4                                                                                      |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Give us a few anchors                                                                           |
|  We only need a small number of examples to build an initial taste profile.                      |
|                                                                                                  |
|  Games you loved                                                                                 |
|  [ Search a game or series................................................................. ]    |
|  [ Final Fantasy VII ] [ Resident Evil 4 ] [ The World Ends With You ]                           |
|                                                                                                  |
|  Games you dropped or didn't enjoy                                                               |
|  [ Search a game or series................................................................. ]    |
|  [ Final Fantasy X ] [ Bayonetta 3 ] [ Marvel Ultimate Alliance 3 ]                              |
|                                                                                                  |
|  What are you playing right now?                                                                 |
|  [ Search a game or series................................................................. ]    |
|  [ Kingdom Hearts III ]                                                                          |
|                                                                                                  |
|  What are you curious about?                                                                     |
|  [ Search a game or series................................................................. ]    |
|  [ Parasite Eve ] [ Chrono Trigger ] [ Ghost Trick ]                                             |
|                                                                                                  |
|  Need at least 3 liked and 3 disliked titles to continue.                                        |
|                                                                                                  |
|                                                  [ I don't know enough yet ] [ Continue ]        |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 4: AI Interview

```text
+--------------------------------------------------------------------------------------------------+
| Step 3 of 4                                                                                      |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Tell us a little more                                                                           |
|  We'll turn a few short answers into your first taste model.                                     |
|                                                                                                  |
|  ----------------------------------------------------------------------------------------------  |
|  AI                                                                                              |
|  Why did Final Fantasy VII work so well for you?                                                 |
|                                                                                                  |
|  You                                                                                             |
|  Strong story, memorable characters, and it kept me engaged.                                     |
|                                                                                                  |
|  AI                                                                                              |
|  What usually makes you drop a game?                                                             |
|                                                                                                  |
|  You                                                                                             |
|  Slow starts, repetition, or when I don't connect emotionally.                                   |
|                                                                                                  |
|  AI                                                                                              |
|  When a game fails, do you usually pause it, drop it, or watch the rest?                        |
|                                                                                                  |
|  [ Write your answer here................................................................. ]    |
|                                                                                                  |
|  ----------------------------------------------------------------------------------------------  |
|  What we are learning                                                                            |
|  - Strong story matters                                                                          |
|  - Slow openings are risky                                                                       |
|  - Repetition hurts fit                                                                          |
|  - Emotional pull matters more than pure style                                                   |
|  ----------------------------------------------------------------------------------------------  |
|                                                                                                  |
|                                                           [ Answer later ] [ Build my profile ]  |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 5: Profile Confirmation

```text
+--------------------------------------------------------------------------------------------------+
| Step 4 of 4                                                                                      |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  This is what we think fits you                                                                  |
|  Review this before we generate your first recommendations.                                      |
|                                                                                                  |
|  +-----------------------------------------+  +-----------------------------------------------+  |
|  | You tend to like                        |  | You tend to bounce when                      |  |
|  |                                         |  |                                               |  |
|  | Strong story                     [x]    |  | Slow starts                            [x]   |  |
|  | Clear progression                [x]    |  | Repetitive loops                       [x]   |  |
|  | Fast engagement                  [x]    |  | Weak emotional pull                    [x]   |  |
|  | Strong atmosphere                [x]    |  | Confusing systems                      [ ]   |  |
|  |                                         |  |                                               |  |
|  | [ edit ] [ remove ]                     |  | [ edit ] [ remove ]                         |  |
|  +-----------------------------------------+  +-----------------------------------------------+  |
|                                                                                                  |
|  Low-confidence signals                                                                          |
|  - Tactical RPGs may work when story payoff is high                                              |
|  - Stylish action may fail without stronger narrative pull                                       |
|                                                                                                  |
|                                                  [ Refine profile ] [ See my recommendations ]   |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 6: First Recommendations

```text
+--------------------------------------------------------------------------------------------------+
| Dashboard                                                                                         |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Current run                                                                                     |
|  +--------------------------------------------------------------------------------------------+  |
|  | [ cover ]  Kingdom Hearts III                                                              |  |
|  |           Affinity: High      Confidence: High                                             |  |
|  |                                                                                            |  |
|  |           - You already committed to this run                                              |  |
|  |           - Current status says this is your active focus                                  |  |
|  |           - Strong action RPG fit with known personal history                              |  |
|  |                                                                                            |  |
|  |           [ Continue this run ]   [ Why this? ]   [ Pause run ]                            |  |
|  +--------------------------------------------------------------------------------------------+  |
|                                                                                                  |
|  +--------------------------------------+  +--------------------------------------+             |
|  | Next up                              |  | Avoid for now                        |             |
|  | [ cover ] Chrono Trigger             |  | [ cover ] Bayonetta 3                |             |
|  | High affinity                        |  | Medium affinity / High risk          |             |
|  | Strong story, payoff, momentum       |  | Stylish but weak long-term fit       |             |
|  | [ Save for later ]                   |  | [ Why risky? ]                       |             |
|  +--------------------------------------+  +--------------------------------------+             |
|                                                                                                  |
|  +--------------------------------------------------------------------------------------------+  |
|  | Best resume: NieR: Automata                                                                 |  |
|  | Mixed confidence. Strong world and style, but previous friction is still unresolved.       |  |
|  | [ Resume candidate details ]                                                               |  |
|  +--------------------------------------------------------------------------------------------+  |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 7: Game Finder

```text
+--------------------------------------------------------------------------------------------------+
| Game Finder                                                                                      |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  [ Search a game or series................................................................. ]    |
|                                                                                                  |
|  +--------------------------------------+  +--------------------------------------------------+  |
|  | Results                               |  | Selected game                                    |  |
|  |                                       |  |                                                  |  |
|  | Resident Evil Director's Cut          |  | [ cover ]  Resident Evil Director's Cut         |  |
|  | High affinity                         |  |                                                  |  |
|  | PS1                                   |  | Affinity: High                                  |  |
|  |---------------------------------------|  | Confidence: Medium                              |  |
|  | Parasite Eve                          |  | Trap risk: Low                                  |  |
|  | High affinity                         |  | Platforms: PlayStation                          |  |
|  | PS1                                   |  |                                                  |  |
|  |---------------------------------------|  | Why it fits                                     |  |
|  | Bayonetta 3                           |  | - Strong story-forward genre match              |  |
|  | Medium affinity / risky               |  | - Good atmosphere and momentum                  |  |
|  | Switch                                |  | - Low repetition signal                         |  |
|  |---------------------------------------|  |                                                  |  |
|  | Death Stranding                       |  | Why it may fail                                 |  |
|  | Interesting but risky                 |  | - Could start slower than your safest fits      |  |
|  | PS5 / PC                              |  |                                                  |  |
|  +--------------------------------------+  | [ Add to next-up ] [ Mark curious ] [ Not for me ]|
|                                            +--------------------------------------------------+  |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Screen 8: Lightweight Check-In

```text
+------------------------------------------------------------------------+
| Session check-in                                                       |
+------------------------------------------------------------------------+
|                                                                        |
|  How did this session feel?                                            |
|  ( ) Good      ( ) Mixed      ( ) Stalled                              |
|                                                                        |
|  Do you want to come back soon?                                        |
|  ( ) Yes       ( ) Maybe      ( ) No                                   |
|                                                                        |
|  What caused friction?                                                 |
|  [ Optional note.................................................... ] |
|                                                                        |
|                                  [ Skip ] [ Save check-in ]            |
|                                                                        |
+------------------------------------------------------------------------+
```

## Screen 9: Upcoming

```text
+--------------------------------------------------------------------------------------------------+
| Upcoming                                                                                         |
+--------------------------------------------------------------------------------------------------+
|                                                                                                  |
|  Ordered from soonest to latest                                                                  |
|                                                                                                  |
|  +-------------+------------------------------+--------------------------+----------------------+  |
|  | Release     | Game                         | Platforms                | Signal               |  |
|  +-------------+------------------------------+--------------------------+----------------------+  |
|  | Apr 17 2026 | PRAGMATA                     | PS5 / Xbox / PC          | Medium fit           |  |
|  |             |                              |                          | In your universes    |  |
|  |             |                              |                          | Available to you     |  |
|  +-------------+------------------------------+--------------------------+----------------------+  |
|  | May 27 2026 | 007 First Light              | PS5 / Xbox / Switch 2 /  | High fit             |  |
|  |             |                              | PC                       | Available to you     |  |
|  +-------------+------------------------------+--------------------------+----------------------+  |
|  | 2026        | Castlevania: Belmont's Curse | TBA                      | High fit             |  |
|  |             |                              |                          | In your universes    |  |
|  +-------------+------------------------------+--------------------------+----------------------+  |
|                                                                                                  |
+--------------------------------------------------------------------------------------------------+
```

## Suggested Design Translation

Use these ASCII wireframes as the base for:

1. frame naming in Figma
2. block hierarchy
3. component extraction
4. desktop-to-mobile adaptation

## Recommended First Set To Design

If moving to visual design now, start with:

1. Landing
2. Taste Anchors
3. AI Interview
4. Profile Confirmation
5. First Recommendations
6. Game Finder
