package expo.modules.mizanepinnedwss

import java.security.MessageDigest
import java.security.cert.CertificateException
import java.security.cert.X509Certificate
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.X509TrustManager

/**
 * TLS trust material for the MIZANE pinned transport.
 *
 * The Phase 1 desktop gateway uses a STABLE self-signed certificate whose
 * SHA-256 fingerprint is published in the pairing QR code. Because that
 * certificate is self-signed and (as generated today) carries no Subject
 * Alternative Name matching the LAN IP, standard PKI chain + hostname
 * verification cannot be used. Instead the leaf certificate is verified by an
 * EXACT, constant-time comparison against the pinned fingerprint.
 *
 * This is deliberately NOT "disabled" certificate validation: the identity of
 * the peer is authenticated by a 256-bit certificate digest delivered
 * out-of-band through the QR code, which is stronger than CA validation for a
 * self-signed certificate. Any certificate whose digest does not match the pin
 * causes the handshake to abort.
 */
internal object PinnedTls {

  /** Lowercase SHA-256 hex digest of a DER-encoded X.509 certificate. */
  fun fingerprintOf(certificate: X509Certificate): String {
    val digest = MessageDigest.getInstance("SHA-256").digest(certificate.encoded)
    val sb = StringBuilder(digest.size * 2)
    for (b in digest) {
      sb.append(HEX[(b.toInt() shr 4) and 0x0F])
      sb.append(HEX[b.toInt() and 0x0F])
    }
    return sb.toString()
  }

  fun createTrustManager(pinnedFingerprint: String): X509TrustManager =
    object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        // Client certificates are not used by the gateway.
      }

      override fun checkServerTrusted(chain: Array<out X509Certificate>?, authType: String?) {
        if (chain == null || chain.isEmpty()) {
          throw CertificateException("The desktop gateway presented no certificate")
        }
        val leaf = chain[0]
        val actual = fingerprintOf(leaf)
        if (!MessageDigest.isEqual(actual.toByteArray(Charsets.US_ASCII), pinnedFingerprint.toByteArray(Charsets.US_ASCII))) {
          throw CertificateException("Certificate fingerprint does not match the pinned gateway fingerprint")
        }
      }

      override fun getAcceptedIssuers(): Array<X509Certificate> = emptyArray()
    }

  fun createSocketFactory(pinnedFingerprint: String): SSLSocketFactory {
    val context = SSLContext.getInstance("TLS")
    context.init(null, arrayOf(createTrustManager(pinnedFingerprint)), null)
    return context.socketFactory
  }

  private val HEX = "0123456789abcdef".toCharArray()
}
