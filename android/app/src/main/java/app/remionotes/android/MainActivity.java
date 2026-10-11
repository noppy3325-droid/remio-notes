package app.remionotes.android;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onDestroy() {
        if (getBridge() != null && getBridge().getWebView() != null) {
            // A recreated Activity can start before its old window detaches.
            // Stop the old document so its JavaScript and Web Locks are released.
            getBridge().getWebView().stopLoading();
            getBridge().getWebView().loadUrl("about:blank");
        }
        super.onDestroy();
    }
}
