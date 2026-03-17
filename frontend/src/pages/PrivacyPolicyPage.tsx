import { Link } from "react-router-dom";
import "../styles/privacy.css";

export default function PrivacyPolicyPage() {
  return (
    <div className="pp">
      <div className="pp-w">
        <Link to="/" className="pp-back">&larr; PeakAerobic</Link>

        <h1 className="pp-title">Privacy Policy</h1>
        <p className="pp-updated">Last updated: March 17, 2026</p>

        {/* ── 1. Introduction ── */}
        <section className="pp-section">
          <h2>1. Introduction</h2>
          <p>
            PeakAerobic ("we", "our", "us") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and share information when you use our platform at peakaerobic.com (the "Service").
          </p>
          <p>
            By using the Service, you agree to the collection and use of information in accordance with this policy. If you do not agree, please do not use the Service.
          </p>
          <p>
            This policy applies to all users of the Service, including coaches and athletes. Where we process data received from third-party platforms (such as Garmin Connect or Strava), this policy should be read in conjunction with the privacy policies of those platforms.
          </p>
        </section>

        {/* ── 2. Data We Collect ── */}
        <section className="pp-section">
          <h2>2. Data We Collect</h2>

          <h3>2.1 Account Information</h3>
          <p>When you create an account, we collect your name, email address, and encrypted password.</p>

          <h3>2.2 Athlete &amp; Health Data</h3>
          <p>
            Coaches may enter athlete profiles including: name, date of birth, sex, weight, height, resting heart rate, maximum heart rate, primary discipline, training goals, and physiological reference values (FTP, CSS, running pace thresholds).
          </p>

          <h3>2.3 Session, Lactate &amp; Physiological Data</h3>
          <p>
            Training session records, lactate test results (blood lactate concentration per interval), heart rate, power output, pace, interval duration, and derived analytics are stored to provide the core functionality of the Service. Derived analytics include but are not limited to:
          </p>
          <ul>
            <li>Lactate thresholds (LT1, LT2) and training zones</li>
            <li>VO2max estimates, VLamax measurements and estimates</li>
            <li>Metabolic contribution models (aerobic/anaerobic, carbohydrate/fat oxidation)</li>
            <li>Race performance predictions</li>
            <li>Training load metrics (CTL, ATL, TSB)</li>
          </ul>

          <h3>2.4 Garmin Connect Data</h3>
          <p>
            If you choose to connect your Garmin Connect account, <strong>your End User Data will be transferred between Garmin and PeakAerobic</strong>. Specifically:
          </p>
          <p><strong>Data we receive from Garmin Connect:</strong></p>
          <ul>
            <li>Activity summaries (date, duration, distance, sport type)</li>
            <li>Activity details (laps, splits, intervals)</li>
            <li>Heart rate data (average, max, time in zones)</li>
            <li>Power output data (average, normalized, max)</li>
            <li>Pace and speed data</li>
            <li>Training metrics (training effect, training status)</li>
          </ul>
          <p><strong>Data we send to Garmin Connect:</strong></p>
          <ul>
            <li>Planned workout structures (step names, target intensities, step durations)</li>
          </ul>
          <p>
            We do <strong>not</strong> send lactate test results, physiological analytics, personal health assessments, or any other derived data to Garmin. Only structured workout plans are transmitted, and only when explicitly initiated by the coach or athlete.
          </p>
          <p><strong>Purpose of processing:</strong> We retrieve your Garmin activity data to calculate physiological analytics (thresholds, training zones, training load) and to enable your coach to monitor your training. We send planned workouts to Garmin so they appear on your Garmin device for execution.</p>
          <p><strong>Method of processing:</strong> Data is transferred via the Garmin Connect API using encrypted HTTPS connections. Authentication credentials are stored encrypted at rest on our servers. Data synchronization occurs periodically or when manually triggered by the coach.</p>
          <p>
            We store encrypted Garmin authentication credentials and synchronization timestamps. We access only the data types necessary for the Service to function.
          </p>
          <p>
            For information about how Garmin processes your data, please refer to the{" "}
            <a href="https://www.garmin.com/privacy/connect" target="_blank" rel="noopener noreferrer">
              Privacy Policy for Garmin Connect and Compatible Garmin Devices
            </a>.
          </p>
          <p>
            <strong>Important:</strong> You must not connect your Garmin account or upload End User Data to PeakAerobic if you are restricted from doing so by any applicable law, regulation, contract, or Garmin's terms of service.
          </p>

          <h3>2.5 Strava Data</h3>
          <p>
            If you choose to connect your Strava account, upon your explicit consent, we use Strava's OAuth2 protocol to access activity data (workouts, heart rate, power, pace). We store OAuth tokens and synchronization timestamps. We do not transmit user data back to Strava beyond what is required by the OAuth2 authentication flow.
          </p>

          <h3>2.6 Usage Data</h3>
          <p>
            We may collect anonymized usage analytics (pages visited, features used) to improve the Service. We do not use third-party tracking or advertising cookies.
          </p>
        </section>

        {/* ── 3. Consent & How to Withdraw ── */}
        <section className="pp-section">
          <h2>3. Consent for Data Collection &amp; How to Withdraw</h2>
          <p>
            <strong>By connecting Garmin Connect or Strava, you expressly consent to the transfer of your activity and health data from those platforms to PeakAerobic for processing as described in this policy.</strong>
          </p>
          <p>You can withdraw your consent and stop data transfers at any time by:</p>
          <ul>
            <li><strong>Disconnecting the integration</strong> from your account settings within the Service — this immediately stops all further data synchronization</li>
            <li><strong>Revoking access</strong> directly from your Garmin Connect or Strava account settings</li>
            <li><strong>Contacting us</strong> at privacy@peakaerobic.com to request disconnection on your behalf</li>
          </ul>
          <p>
            Withdrawing consent will stop future data synchronization. Previously synced data will remain in the Service until you explicitly request its deletion (see Section 7).
          </p>
          <p>
            Withdrawing consent does not affect the lawfulness of processing carried out before the withdrawal.
          </p>
        </section>

        {/* ── 4. How We Use Your Data ── */}
        <section className="pp-section">
          <h2>4. How We Use Your Data</h2>
          <p>We use the data we collect for the following purposes:</p>
          <ul>
            <li>To provide, maintain, and improve the Service</li>
            <li>To calculate physiological analytics (lactate thresholds, training zones, metabolic estimates, VO2max, VLamax)</li>
            <li>To generate training plans, mesocycle prescriptions, and session recommendations</li>
            <li>To push planned workouts to connected devices (Garmin)</li>
            <li>To enable coach-athlete data sharing within the platform</li>
            <li>To send transactional emails (account confirmation, password reset)</li>
            <li>To respond to support requests</li>
          </ul>
          <p>
            We do <strong>not</strong> use your personal data for advertising, profiling for marketing purposes, or selling to third parties. We will not sell End User Personal Data received via the Garmin Connect API or any other third-party API without the End User's lawful consent.
          </p>
        </section>

        {/* ── 5. Automated Processing & AI Transparency ── */}
        <section className="pp-section">
          <h2>5. Automated Processing &amp; AI Transparency</h2>
          <p>
            PeakAerobic uses algorithmic and automated decision-making systems to process your physiological data. These systems are deterministic mathematical models based on peer-reviewed sport science literature — they are <strong>not</strong> machine learning models trained on user data. Specifically:
          </p>
          <ul>
            <li><strong>Threshold detection engine:</strong> Identifies lactate thresholds (LT1, LT2) from test data using established methods (Baseline Rise, Sustained Increase, Modified Dmax — Bishop 1998, Faude 2009).</li>
            <li><strong>Physiological engine:</strong> Estimates VO2max (Swain &amp; ACSM formulas), VLamax (Mader 2003), and metabolic profiles based on threshold relationships (Olbrecht model).</li>
            <li><strong>Planning engine:</strong> Generates training block recommendations based on physiological profile, training phase, and periodization principles.</li>
            <li><strong>Prediction engine:</strong> Estimates race performance using the di Prampero energy cost model and Gastin 2001 energy contribution data.</li>
          </ul>
          <p>
            All automated outputs include confidence scores and reliability warnings to inform the coach's decision-making. These systems provide recommendations only — final training decisions are always made by the coach or athlete.
          </p>
          <p>
            <strong>We do not use your data to train machine learning or artificial intelligence models.</strong> Your physiological data is processed solely to provide you with the analytics described above. No End User Data is used for model training, generative AI, or any purpose beyond the direct provision of the Service.
          </p>
        </section>

        {/* ── 6. Data Storage & Security ── */}
        <section className="pp-section">
          <h2>6. Data Storage &amp; Security</h2>
          <p>
            Your data is stored on secure servers. We maintain a security program that includes policies and procedures to safeguard data and systems that are no less rigorous than accepted industry practices:
          </p>
          <ul>
            <li>Passwords are hashed using industry-standard PBKDF2-SHA256 with unique salts</li>
            <li>Third-party integration credentials (Garmin, Strava tokens) are encrypted at rest</li>
            <li>All data transmission between client and server uses HTTPS/TLS encryption</li>
            <li>Database access is restricted to authenticated and authorized users only</li>
            <li>Coach accounts can only access data for their own athletes</li>
            <li>We employ security controls to proactively defend against, identify weaknesses in, and identify attacks against systems or data that interface with third-party services</li>
          </ul>
          <p>
            We implement reasonable technical and organizational measures to protect against unauthorized or unlawful processing and against accidental loss, destruction, or damage, in accordance with applicable data protection laws.
          </p>
        </section>

        {/* ── 7. Data Sharing & Transfers ── */}
        <section className="pp-section">
          <h2>7. Data Sharing &amp; Third-Party Data Transfers</h2>
          <p>We do not sell, trade, or rent your personal data to third parties. We may share data only in the following cases:</p>
          <ul>
            <li><strong>Coach-Athlete relationship:</strong> Athletes' physiological data is visible to their assigned coach within the platform.</li>
            <li>
              <strong>Garmin Connect:</strong> When you use the workout push feature, planned workout data (workout structure, target intensities, step durations) is transmitted to Garmin's servers via the Garmin Connect API to be synced to your device. This transfer occurs only when explicitly initiated by the coach or athlete. No lactate data, physiological analytics, or personal health information is sent to Garmin — only the workout structure. For details on how Garmin handles data it receives, see the{" "}
              <a href="https://www.garmin.com/privacy/connect" target="_blank" rel="noopener noreferrer">
                Garmin Connect Privacy Policy
              </a>.
            </li>
            <li>
              <strong>Strava:</strong> We receive data from Strava but do not transmit user data back to Strava beyond what is required by the OAuth2 authentication flow.
            </li>
            <li><strong>Service providers:</strong> Trusted third parties who assist in operating the Service (e.g., cloud hosting), bound by confidentiality agreements and data processing agreements.</li>
            <li><strong>Legal obligations:</strong> If required by law, regulation, or legal process.</li>
          </ul>
          <p>
            We do not disclose End User Personal Data in any manner that would be deemed a sale under applicable data protection laws. Any disclosure of End User Personal Data to service providers has a lawful basis for processing.
          </p>
        </section>

        {/* ── 8. Data Retention & Deletion ── */}
        <section className="pp-section">
          <h2>8. Data Retention &amp; Deletion</h2>
          <p>We retain data according to the following schedule:</p>
          <ul>
            <li><strong>Account data:</strong> Retained for the lifetime of your active account.</li>
            <li><strong>Athlete profiles &amp; session data:</strong> Retained for the lifetime of the associated coach account, or until the coach deletes the athlete profile.</li>
            <li><strong>Physiological snapshots &amp; analytics:</strong> Retained for the lifetime of the associated athlete profile.</li>
            <li><strong>Third-party integration tokens:</strong> Retained while the integration is connected. Deleted immediately upon disconnection.</li>
            <li><strong>Garmin activity data:</strong> Retained for the lifetime of the associated athlete profile. Upon disconnection of the Garmin integration, previously synced data is retained unless you request deletion.</li>
            <li><strong>Server logs:</strong> Retained for a maximum of 90 days, then automatically purged.</li>
          </ul>
          <p>
            <strong>Account deletion:</strong> You may request complete deletion of your account and all associated data at any time by contacting us at privacy@peakaerobic.com. Upon receiving a verified deletion request:
          </p>
          <ul>
            <li>All personal data, athlete profiles, sessions, analytics, and integration tokens will be permanently deleted within 30 days</li>
            <li>Anonymized, aggregated statistical data (which cannot identify any individual) may be retained for service improvement purposes</li>
            <li>Data required to be retained by law (e.g., billing records) will be kept for the legally mandated period and then deleted</li>
          </ul>
        </section>

        {/* ── 9. Your Rights ── */}
        <section className="pp-section">
          <h2>9. Your Rights</h2>
          <p>Depending on your jurisdiction, you have the right to:</p>
          <ul>
            <li><strong>Access:</strong> Request a copy of the personal data we hold about you</li>
            <li><strong>Rectification:</strong> Request correction of inaccurate or incomplete data</li>
            <li><strong>Erasure:</strong> Request deletion of your data ("right to be forgotten")</li>
            <li><strong>Portability:</strong> Request export of your data in a structured, machine-readable format (JSON)</li>
            <li><strong>Restriction:</strong> Request limitation of processing of your data</li>
            <li><strong>Objection:</strong> Object to processing of your data based on legitimate interests</li>
            <li><strong>Withdraw consent:</strong> Withdraw consent for optional data processing at any time, without affecting the lawfulness of prior processing</li>
          </ul>
          <p>
            To exercise any of these rights — including with respect to data collected via the Garmin Connect API or any other third-party integration — contact us at <strong>privacy@peakaerobic.com</strong>. We will respond to verified requests within 30 days.
          </p>
        </section>

        {/* ── 10. GDPR ── */}
        <section className="pp-section">
          <h2>10. GDPR Compliance (EU/EEA Users)</h2>
          <p>
            If you are located in the European Economic Area, we process your personal data under the following legal bases:
          </p>
          <ul>
            <li><strong>Contract (Art. 6(1)(b)):</strong> Processing necessary to provide the Service you signed up for — including physiological analytics, training plans, and third-party integrations you have activated.</li>
            <li><strong>Legitimate interest (Art. 6(1)(f)):</strong> Improving and securing the Service, preventing fraud.</li>
            <li><strong>Consent (Art. 6(1)(a)):</strong> Where you have given explicit consent, such as connecting third-party services (Garmin, Strava) or receiving optional communications.</li>
          </ul>
          <p>
            <strong>Health data:</strong> Physiological data (heart rate, lactate levels, VO2max estimates) may qualify as special category data under Art. 9 GDPR. We process this data based on your explicit consent (Art. 9(2)(a)), given when you create your account and enter physiological data into the Service.
          </p>
          <p>
            <strong>International transfers:</strong> If your data is transferred outside the EEA, we ensure adequate protection through Standard Contractual Clauses (SCCs) or equivalent safeguards as required by applicable data protection law.
          </p>
          <p>
            You have the right to lodge a complaint with your local data protection authority.
          </p>
        </section>

        {/* ── 11. Security Incident Response ── */}
        <section className="pp-section">
          <h2>11. Security Incident Response</h2>
          <p>
            In the event of a confirmed Personal Data Breach or major security incident affecting systems or data that interface with third-party services (including Garmin Connect):
          </p>
          <ul>
            <li>We will notify affected third-party platform providers (including Garmin at security@garmin.com) within twenty-four (24) hours of confirmation</li>
            <li>We will notify affected users without undue delay and no later than 72 hours after becoming aware of the breach, as required by GDPR Art. 33</li>
            <li>We will notify the relevant data protection authority where required by law</li>
            <li>We will take immediate steps to contain the breach and mitigate potential harm</li>
          </ul>
          <p>
            If you discover a security vulnerability in the Service, please report it to <strong>security@peakaerobic.com</strong>.
          </p>
        </section>

        {/* ── 12. Cookies ── */}
        <section className="pp-section">
          <h2>12. Cookies &amp; Local Storage</h2>
          <p>
            The Service uses only essential storage mechanisms:
          </p>
          <ul>
            <li><strong>Authentication token:</strong> Stored in localStorage to maintain your session. This is strictly necessary for the Service to function.</li>
            <li><strong>Language preference:</strong> Stored in localStorage for your convenience.</li>
          </ul>
          <p>
            We do not use advertising cookies, third-party tracking cookies, or analytics cookies. No data is shared with advertising networks.
          </p>
        </section>

        {/* ── 13. Children ── */}
        <section className="pp-section">
          <h2>13. Children's Privacy</h2>
          <p>
            The Service is not directed at individuals under 16 years of age. We do not knowingly collect personal data from children under 16. If you believe we have inadvertently collected data from a child under 16, please contact us immediately at privacy@peakaerobic.com and we will delete it promptly.
          </p>
        </section>

        {/* ── 14. Changes ── */}
        <section className="pp-section">
          <h2>14. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. When we make material changes, we will:
          </p>
          <ul>
            <li>Post the updated policy on this page with a new "Last updated" date</li>
            <li>Notify registered users by email for significant changes affecting data handling</li>
            <li>Where required by law, obtain your renewed consent before applying changes</li>
          </ul>
          <p>
            We encourage you to review this policy periodically.
          </p>
        </section>

        {/* ── 15. Contact ── */}
        <section className="pp-section">
          <h2>15. Contact</h2>
          <p>
            If you have questions about this Privacy Policy or wish to exercise your data rights, contact us at:
          </p>
          <p>
            <strong>General privacy inquiries:</strong> privacy@peakaerobic.com
          </p>
          <p>
            <strong>Security concerns &amp; breach reports:</strong> security@peakaerobic.com
          </p>
          <p>
            <strong>Data Controller:</strong> PeakAerobic — David Sabat Fernandez, Founder
          </p>
        </section>
      </div>
    </div>
  );
}
