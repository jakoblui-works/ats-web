"""The names `pdfminer.pdfdocument` imports. pdfminer calls them only for AES (`Cipher(algorithms.AES(key),
modes.CBC(iv), ...)`), and each one raises its `PDFEncryptionError`, so an AES-encrypted PDF ends as `encrypted`.
"""


class _Unavailable:
    def __init__(self, *args: object, **kwargs: object) -> None:
        # Imported here: pdfminer.pdfdocument imports this module, so it isn't loaded yet at import time.
        from pdfminer.pdfdocument import PDFEncryptionError

        raise PDFEncryptionError("AES is unavailable: cryptography is not installed")


class Cipher(_Unavailable):
    pass


class algorithms:  # noqa: N801 (the real package's name)
    AES = _Unavailable


class modes:  # noqa: N801 (the real package's name)
    CBC = _Unavailable
