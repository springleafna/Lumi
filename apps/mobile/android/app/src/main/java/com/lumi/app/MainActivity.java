package com.lumi.app;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    // 分享接收：把 ACTION_SEND 的 text/plain 改写为指向自身 origin 的 ACTION_VIEW
    // 深链（https://localhost/_share?text=...），复用 Capacitor App 插件的
    // appUrlOpen / getLaunchUrl 通道，冷启动与热启动都能送达 WebView。
    private static final String SHARE_HOST = "localhost";
    private static final String SHARE_PATH = "/_share";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        rewriteShareIntent(getIntent());
        super.onCreate(savedInstanceState);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        rewriteShareIntent(intent);
        if (intent != null) {
            setIntent(intent);
        }
    }

    private void rewriteShareIntent(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) {
            return;
        }
        String type = intent.getType();
        if (type == null || !type.startsWith("text/plain")) {
            return;
        }
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.isEmpty()) {
            return;
        }

        Uri.Builder builder = new Uri.Builder()
                .scheme("https")
                .authority(SHARE_HOST)
                .path(SHARE_PATH)
                .appendQueryParameter("text", text);
        String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (subject != null && !subject.isEmpty()) {
            builder.appendQueryParameter("title", subject);
        }

        intent.setAction(Intent.ACTION_VIEW)
                .setData(builder.build())
                .replaceExtras((Bundle) null);
    }
}
