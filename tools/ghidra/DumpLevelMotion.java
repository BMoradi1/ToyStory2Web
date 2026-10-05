// Dump the 15 level ticks and their direct level-local helper graph for game-audit.ts.
// Output contains executable-derived code: keep it outside the repository.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.Function;
import java.io.*;
import java.util.*;
import java.util.regex.*;

public class DumpLevelMotion extends GhidraScript {
  private static final String[] TICKS={"00417680","004190c0","0041aa10","0041c640","0041e880","00420060","00421340","00423200","00424490","00425f60","0042a130","0042b3a0","0042ca60","0042e790","0042fc50"};
  private Function define(String address) throws Exception {
    Function f=getFunctionAt(toAddr(address));
    if(f==null){disassemble(toAddr(address));f=createFunction(toAddr(address),null);}
    return f;
  }
  public void run() throws Exception {
    if(getScriptArgs().length!=1)throw new IllegalArgumentException("Supply a temporary output .c path");
    for(String address:TICKS)define(address);
    DecompInterface decompiler=new DecompInterface();
    decompiler.openProgram(currentProgram);
    Pattern calls=Pattern.compile("(?:FUN_|func_0x)([0-9a-fA-F]{8})\\(");
    ArrayDeque<String> queue=new ArrayDeque<>(Arrays.asList(TICKS));
    Set<String> visited=new HashSet<>();
    try(PrintWriter out=new PrintWriter(new FileWriter(getScriptArgs()[0]))){
      while(!queue.isEmpty()&&!monitor.isCancelled()){
        String address=queue.remove();if(!visited.add(address))continue;
        out.println("// "+address);
        Function function=define(address);
        if(function==null){out.println("// decompile failed: function unavailable");continue;}
        decompiler.flushCache();
        DecompileResults result=decompiler.decompileFunction(function,60,monitor);
        if(result==null||result.getDecompiledFunction()==null){out.println("// decompile failed");continue;}
        String body=result.getDecompiledFunction().getC();out.println(body);
        Matcher match=calls.matcher(body);
        while(match.find()){
          String target=match.group(1).toLowerCase(Locale.ROOT);
          if(target.compareTo("00417000")>=0&&target.compareTo("00430000")<0&&!visited.contains(target))queue.add(target);
        }
      }
    }finally{decompiler.dispose();}
    println("DumpLevelMotion: visited "+visited.size()+" level functions");
    if(monitor.isCancelled())throw new IOException("Cancelled: output is incomplete");
  }
}
