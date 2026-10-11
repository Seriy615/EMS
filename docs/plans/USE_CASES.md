# Product use cases and their architectural implications

## UC-01 Musical Bingo (origin story)

Roles: host/operator, participant, screen/projector. Shared session, 50-cell cards, track catalog, round progression, results, broadcast output and network state. All composed in one logical EMS application; music rights and licensing are external deployment responsibilities. Phase M7.

## UC-02 Speedcubing

Judges/timers, competitors, round manager, scramblers, scoreboards and live camera overlays. Official WCA Ao5 is a composite of time results and penalty/DNF rules (not only `(sum-min-max)/3`). Device timers use atom contracts linked to external drivers. Phase M8.

## UC-03 Smartphone camera QR reader

`Camera.Capture` atomic capability → `QR.Decode` imported atomic or composite → `UI.Display` composite. Same logical graph supported across native/Web only where actual camera permissions and implementations exist. Phase M6+.

## UC-04 Imported crypto library

Developer brings a maintained verified native/WASM crypto package. Importer maps selected functions to contracts `encrypt`, `decrypt`, `generate_key`, with correct resource/secret semantics. Composer creates a `SecureStorage` composite contract from atoms. Phase M5.

## UC-05 A graphical node becomes an app

User clicks `Scoreboard` and inspects subgraph. `Scoreboard` can contain `WCA.AverageOfFive`, UI state and `TimerEvent` inputs. Save as a contract and embed in larger competition application. Phase M2+.

## UC-06 Same app different build

A simple file/storage/UI app with one source graph is compiled to Web and second real target without rewriting its logic, while implementation binding and permissions change. Phase M6.

## UC-07 AI builds from natural language

User says “Создай систему музыкального лото для 200 гостей”; AI discovers actual contracts, proposes inputs and design, creates typed graph, tests in preview and offers export. Unavailable capabilities are reported instead of fabricated. Phase M9.
