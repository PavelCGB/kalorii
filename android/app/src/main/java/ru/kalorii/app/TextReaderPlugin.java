package ru.kalorii.app;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.mlkit.vision.common.InputImage;
import com.google.mlkit.vision.text.TextRecognition;
import com.google.mlkit.vision.text.latin.TextRecognizerOptions;

/**
 * Распознавание текста на фото прямо в телефоне (ML Kit): бесплатно, офлайн, без ключей.
 * Нужно, чтобы читать этикетки КБЖУ, когда ИИ не настроен.
 */
@CapacitorPlugin(name = "TextReader")
public class TextReaderPlugin extends Plugin {

    @PluginMethod
    public void read(PluginCall call) {
        String b64 = call.getString("image");
        if (b64 == null || b64.isEmpty()) {
            call.reject("нет картинки");
            return;
        }
        byte[] bytes;
        try {
            bytes = Base64.decode(b64, Base64.DEFAULT);
        } catch (Exception e) {
            call.reject("битая картинка");
            return;
        }
        Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
        if (bmp == null) {
            call.reject("не получилось открыть фото");
            return;
        }
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
            .process(InputImage.fromBitmap(bmp, 0))
            .addOnSuccessListener(result -> {
                JSObject res = new JSObject();
                res.put("text", result.getText());
                call.resolve(res);
            })
            .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "ошибка распознавания" : e.getMessage()));
    }
}
