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

/**
 * Ставит скачанный APK: открывает системное окно «Установить приложение».
 * Нужен, потому что WebView не умеет запускать установщик сам.
 */
@CapacitorPlugin(name = "ApkInstaller")
public class ApkInstallerPlugin extends Plugin {

    @PluginMethod
    public void install(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) {
            call.reject("empty path");
            return;
        }
        File file;
        if (path.startsWith("file://")) {
            file = new File(Uri.parse(path).getPath());
        } else if (path.startsWith("/")) {
            file = new File(path);
        } else {
            file = new File(getContext().getCacheDir(), path);
        }
        if (!file.exists()) {
            call.reject("file not found: " + file.getAbsolutePath());
            return;
        }
        try {
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(uri, "application/vnd.android.package-archive");
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject res = new JSObject();
            res.put("started", true);
            call.resolve(res);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? e.toString() : e.getMessage());
        }
    }
}
