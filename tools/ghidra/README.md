# Ghidra headless decompiles of the two executables

The install ships the game twice: `toy2.exe` (x86, the PC port) and
`data/psx.exe` (MIPS, the PlayStation build, SLUS-00893). Both are the same C
source, so anything found in one can be checked in the other. These scripts
turn each into one big text file of decompiled C that can be grepped, which is
far faster than round-tripping through Ghidra per question.

Ghidra is at `/opt/ghidra` on this machine (`analyzeHeadless` under
`support/`). Projects go in a scratch directory; nothing here writes into the
game install.

    GAME="/path/to/Toy Story 2"       # read-only, never modified
    SCR=/tmp/ts2-ghidra; mkdir -p $SCR/pc $SCR/psx
    HL=/opt/ghidra/support/analyzeHeadless
    SCRIPTS=$(pwd)/tools/ghidra

    # PC: about 3 minutes to analyse, 1 more to dump 1,318 functions
    $HL $SCR/pc toy2 -import "$GAME/toy2.exe" -overwrite \
        -analysisTimeoutPerFile 800 \
        -scriptPath $SCRIPTS -postScript DumpAll.java $SCR/toy2_all.c

    # PSX: strip the 2048-byte PS-X EXE header, load as raw MIPS at 0x80010000,
    # seed the entry point and the JAL targets, then dump 1,178 functions
    tail -c +2049 "$GAME/data/psx.exe" > $SCR/psx_text.bin
    curl -sL https://raw.githubusercontent.com/PeriBluGaming/ToyStory2Recomp/main/seeds/functions.txt \
        -o $SCR/psx_functions.txt
    $HL $SCR/psx psx -import $SCR/psx_text.bin -overwrite \
        -processor MIPS:LE:32:default -loader BinaryLoader -loader-baseAddr 0x80010000 \
        -analysisTimeoutPerFile 800 -scriptPath $SCRIPTS \
        -preScript PsxEntry.java $SCR/psx_functions.txt \
        -postScript DumpAll.java $SCR/psx_all.c

To re-dump without re-analysing, run the same command with `-process <name>
-noanalysis` instead of `-import`.

Notes:

- The PS-X EXE header says the initial PC is 0x8006a244 and the text loads at
  0x80010000; `PsxEntry.java` hard-codes the former. The Recomp seed list is
  plain addresses with no names, so it only helps Ghidra find function starts.
- The dump format is `//// FUNC <name> @ <addr> size=<bytes>` followed by the
  C. A function's body can be pulled out with
  `awk -v n=FUN_00436220 '/^\/\/\/\/ FUNC/{p=($3==n)} p' toy2_all.c`.
- Ghidra drops x87 float code as `__ftol()`. For those spots use
  `objdump -d -M intel --start-address=... --stop-address=... toy2.exe`; the
  PE loads fine.
- Decompiled text is derived from the copyrighted executables. Keep the dumps
  in scratch space; do not commit them.
