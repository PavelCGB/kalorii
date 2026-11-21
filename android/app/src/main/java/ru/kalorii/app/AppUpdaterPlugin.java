package ru.kalorii.app;

import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Скачивает APK внутри приложения (с прогрессом) и открывает системный установщик.
 * Своя загрузка нужна потому, что GitHub отвечает редиректом на другой домен,
 * а Filesystem.downloadFile на этом ломается — и в интерфейсе ничего не видно.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final int TIMEOUT_CONNECT = 15000;
    private static final int TIMEOUT_READ = 30000;
    private static final long PROGRESS_EVERY_MS = 120;

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("empty url");
            return;
        }
        final String link = url;
        call.resolve();
        new Thread(() -> download(link), "kalorii-updater").start();
    }

    private void download(String url) {
        HttpURLConnection conn = null;
        File out = new File(getContext().getCacheDir(), "kalorii-update.apk");
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(TIMEOUT_CONNECT);
            conn.setReadTimeout(TIMEOUT_READ);
            conn.setRequestProperty("User-Agent", "Kalorii-Updater");
            conn.setRequestProperty("Accept", "application/octet-stream");
            int code = conn.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) throw new IOException("HTTP " + code);

            long total = conn.getContentLengthLong();
            long done = 0;
            long lastSent = 0;
            byte[] buf = new byte[64 * 1024];
            try (InputStream in = conn.getInputStream(); FileOutputStream os = new FileOutputStream(out)) {
                int n;
                while ((n = in.read(buf)) > 0) {
                    os.write(buf, 0, n);
                    done += n;
                    long now = System.currentTimeMillis();
                    if (now - lastSent >= PROGRESS_EVERY_MS) {
                        lastSent = now;
                        emitProgress(done, total);
                    }
                }
            }
            emitProgress(done, done);
            install(out);
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
            notifyListeners("error", err);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }

    private void emitProgress(long bytes, long total) {
        JSObject p = new JSObject();
        p.put("bytes", bytes);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private void install(File file) {
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            notifyListeners("installing", new JSObject());
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("message", e.getMessage() == null ? e.toString() : e.getMessage());
            notifyListeners("error", err);
        }
    }
}
