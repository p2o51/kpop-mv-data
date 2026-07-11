# Known limitations

1. **Public counters ≠ Charts-eligible plays.** YouTube has stated that paid advertising plays can appear in the public counter while not counting toward YouTube Music Charts. The inverse is not a clean “ad views” number.
2. **Missing Charts membership ≠ zero organic plays.** Songs can fall off Charts for reasons other than zero eligible growth.
3. **Period boundaries.** Charts weeks are Pacific Time Friday–Thursday; snapshot clocks and Charts windows can misalign by hours.
4. **Multiple uploads.** The same track may exist as main MV, 1theK mirror, JP version, performance video, etc. Classification is human-maintained and imperfect.
5. **API retention / terms.** YouTube API Services Terms restrict how API data may be stored, combined, and used to create certain derived metrics. Running a private estimator does not automatically make the collection compliant — review current terms before scaling.
6. **Quota and outages.** Missed cron runs create gaps; growth between sparse points is still valid but lower resolution.
7. **Hidden like/comment counts.** Some videos omit public like or comment counts; those fields may be `null`.
8. **Scope: Korean-industry channels only (v0).** Japan-only channels (TWICE JAPAN, ITZY JAPAN, STAYC Japan, LAPONE, Sony Music Japan) are not polled, so Japanese-release MVs hosted there are absent. Japanese MVs uploaded to tracked Korean channels are kept as `japanese_version` (inactive by default).
9. **Distributor-hosted MVs are never auto-activated.** Acts whose MVs live only on 1theK/Stone Music (some RBW/Woollim soloists, IU OSTs) need a manual `active: true` row (`notes: manual`).
10. **Third-party collab hosts.** Collabs published on the partner's channel (Pabllo Vittar × NMIXX, Anderson .Paak × NMIXX) are outside the channel set.
11. **Out-of-scope acts (deliberate).** Co-ed groups (ALLDAY PROJECT), J-pop groups (NiziU, XG, ME:I, IS:SUE), US projects other than KATSEYE (Girlset, A2O MAY), and fictional acts (HUNTR/X) are excluded from the girl-group registry; KATSEYE is included with a `scope: global` note because its MVs share HYBE LABELS with tracked acts.
