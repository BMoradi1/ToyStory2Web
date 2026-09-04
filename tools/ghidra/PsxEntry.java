import ghidra.app.script.GhidraScript;
import ghidra.program.model.address.*;
import ghidra.program.model.symbol.*;
public class PsxEntry extends GhidraScript {
  public void run() throws Exception {
    Address a = toAddr(0x8006a244L);
    currentProgram.getSymbolTable().addExternalEntryPoint(a);
    createFunction(a, "_start");
    // seed every JAL target from the Recomp list
    java.io.BufferedReader r = new java.io.BufferedReader(new java.io.FileReader(getScriptArgs()[0]));
    String l; int n=0;
    while ((l = r.readLine()) != null) {
      l = l.trim(); if (!l.startsWith("0x")) continue;
      Address f = toAddr(Long.parseLong(l.substring(2),16));
      if (getFunctionAt(f)==null && createFunction(f, null)!=null) n++;
    }
    println("seeded "+n);
  }
}
