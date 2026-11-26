package de.ck.ballerburg;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Insets;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.view.DisplayCutout;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.net.Uri;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import android.window.OnBackInvokedCallback;
import android.window.OnBackInvokedDispatcher;

public class MainActivity extends Activity {
    private static final String ASSET_HOST = "appassets.androidplatform.net";
    private WebView web;

    private static String mimeOf(String p) {
        String l = p.toLowerCase();
        if (l.endsWith(".html")) return "text/html";
        if (l.endsWith(".js")) return "application/javascript";
        if (l.endsWith(".css")) return "text/css";
        if (l.endsWith(".webp")) return "image/webp";
        if (l.endsWith(".png")) return "image/png";
        if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
        if (l.endsWith(".svg")) return "image/svg+xml";
        if (l.endsWith(".json")) return "application/json";
        return "application/octet-stream";
    }
    private volatile float insetTop, insetBottom, insetLeft, insetRight;
    private OnBackInvokedCallback backCallback;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        WindowManager.LayoutParams lp = getWindow().getAttributes();
        lp.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        getWindow().setAttributes(lp);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setTextZoom(100);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        web.addJavascriptInterface(new Bridge(), "Android");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (ASSET_HOST.equals(u.getHost())) {
                    String path = u.getPath();
                    if (path == null || path.equals("/") || path.isEmpty()) path = "/index.html";
                    String mime = mimeOf(path);
                    try {
                        InputStream in = getAssets().open(path.substring(1));
                        return new WebResourceResponse(mime, mime.startsWith("image/") ? null : "UTF-8", in);
                    } catch (IOException e) {
                        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
                    }
                }
                return super.shouldInterceptRequest(view, req);
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);

        web.setOnApplyWindowInsetsListener((v, insets) -> {
            float d = getResources().getDisplayMetrics().density;
            int t = 0, b = 0, l = 0, r = 0;
            DisplayCutout cut = insets.getDisplayCutout();
            if (cut != null) { t = cut.getSafeInsetTop(); b = cut.getSafeInsetBottom(); l = cut.getSafeInsetLeft(); r = cut.getSafeInsetRight(); }
            if (Build.VERSION.SDK_INT >= 30) {
                Insets sys = insets.getInsets(WindowInsets.Type.systemBars());
                t = Math.max(t, sys.top); b = Math.max(b, sys.bottom); l = Math.max(l, sys.left); r = Math.max(r, sys.right);
            }
            insetTop = t / d; insetBottom = b / d; insetLeft = l / d; insetRight = r / d;
            final String js = "window.__setInsets&&window.__setInsets(" + insetTop + "," + insetBottom + "," + insetLeft + "," + insetRight + ")";
            web.post(() -> web.evaluateJavascript(js, null));
            return insets;
        });

        web.loadUrl("https://" + ASSET_HOST + "/index.html");

        if (Build.VERSION.SDK_INT >= 33) {
            backCallback = this::handleBack;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback);
        }
        hideBars();
    }

    private void hideBars() {
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            WindowInsetsController c = getWindow().getInsetsController();
            if (c != null) {
                c.hide(WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    private void handleBack() {
        web.evaluateJavascript("(window.__onBack?window.__onBack():false)", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() { handleBack(); }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) hideBars();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
        hideBars();
    }

    @Override
    protected void onPause() {
        web.evaluateJavascript("window.__onPause&&window.__onPause()", null);
        web.onPause();
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (Build.VERSION.SDK_INT >= 33 && backCallback != null) getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback(backCallback);
        web.destroy();
        super.onDestroy();
    }

    private class Bridge {
        @JavascriptInterface
        public void vibrate(int ms) {
            Vibrator v = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            if (v == null || !v.hasVibrator()) return;
            int amp = v.hasAmplitudeControl() ? Math.min(255, 60 + ms * 3) : VibrationEffect.DEFAULT_AMPLITUDE;
            v.vibrate(VibrationEffect.createOneShot(Math.max(1, ms), amp));
        }

        @JavascriptInterface
        public String getInsets() {
            return "{\"top\":" + insetTop + ",\"bottom\":" + insetBottom + ",\"left\":" + insetLeft + ",\"right\":" + insetRight + "}";
        }

        @JavascriptInterface
        public void setOrientation(String mode) {
            final String m = mode == null ? "quer" : mode;
            runOnUiThread(() -> {
                if ("hoch".equals(m)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_PORTRAIT);
                else if ("auto".equals(m)) setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
                else setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
            });
        }
    }
}
