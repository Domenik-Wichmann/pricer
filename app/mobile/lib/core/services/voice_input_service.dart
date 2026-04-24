import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';

abstract class VoiceInputService {
  Future<String?> captureOnce();
}

class SpeechToTextVoiceInputService implements VoiceInputService {
  SpeechToTextVoiceInputService({
    SpeechToText? speechToText,
  }) : _speech = speechToText ?? SpeechToText();

  final SpeechToText _speech;

  @override
  Future<String?> captureOnce() async {
    final available = await _speech.initialize();
    if (!available) {
      return null;
    }

    String? words;
    await _speech.listen(
      localeId: 'bg_BG',
      onResult: (SpeechRecognitionResult result) {
        if (result.finalResult) {
          words = result.recognizedWords.trim();
        }
      },
      listenOptions: SpeechListenOptions(
        listenMode: ListenMode.confirmation,
      ),
    );

    await Future<void>.delayed(const Duration(seconds: 4));
    await _speech.stop();
    return words;
  }
}
