// Create functions at the addresses listed in a file (one hex address per
// line), then let the analyser follow their calls. Used as a -preScript with
// -process on an existing project, for code the first pass never reached:
// the level scripts in toy2.exe are dispatched through a table the analyser
// did not resolve, so none of them were defined.
import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.List;

public class DefineFuncs extends GhidraScript {
  @Override
  public void run() throws Exception {
    List<String> lines = Files.readAllLines(Paths.get(getScriptArgs()[0]));
    int made = 0;
    for (String line : lines) {
      String s = line.trim();
      if (s.isEmpty() || s.startsWith("#")) continue;
      Address a = toAddr(Long.parseLong(s.replace("0x", ""), 16));
      if (getFunctionAt(a) != null) continue;
      disassemble(a);
      Function f = createFunction(a, null);
      if (f != null) made++;
      else println("could not create function at " + a);
    }
    println("DefineFuncs: created " + made + " functions");
  }
}
