import com.fisher.chess.StockfishProcess;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import kotlin.Unit;

public class NativeSmoke {
    static StockfishProcess.Result search(StockfishProcess engine, String fen, int seconds) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<StockfishProcess.Result> result = new AtomicReference<>();
        engine.search(fen, 3, 8, 200, -1, value -> {
            result.set(value); done.countDown(); return Unit.INSTANCE;
        });
        if (!done.await(seconds, TimeUnit.SECONDS)) throw new AssertionError("engine callback timed out");
        return result.get();
    }
    public static void main(String[] args) throws Exception {
        StockfishProcess engine = new StockfishProcess(args[0]);
        try {
            StockfishProcess.Result result = search(engine, "k7/8/1K6/8/8/8/8/R7 b - - 0 1", 10);
            if (result == null || !result.getBestmove().equals("a8b8")) throw new AssertionError("wrong forced move");
            if (result.getLines().isEmpty()) throw new AssertionError("missing evaluation");
            System.out.println("ok   Kotlin transport: real Stockfish forced move");
        } finally {engine.shutdown();}
        StockfishProcess silent = new StockfishProcess(System.getenv("ComSpec"));
        try {
            if (search(silent, "k7/8/1K6/8/8/8/8/R7 b - - 0 1", 18) != null)
                throw new AssertionError("silent process returned a result");
            System.out.println("ok   Kotlin transport: silent process fails within 18 seconds");
        } finally {silent.shutdown();}
    }
}
