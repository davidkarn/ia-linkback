import { Kysely, sql } from 'kysely';

// The names a book goes by (alternate_book_names): its title, the parts of
// a title naming it two ways ("Against the Arians. (Orationes contra Arianos
// IV.)", "The Stromata, or Miscellanies"), and the names it's known and cited
// by, mostly the Latin ("De Civitate Dei" and "Civitas Dei" for City of God,
// "De Anima", "On the Vital Principle" and "Aristotle's Psychology" for On
// the Soul). A name is a book's once (ignoring case), but several books can
// share one ("Letters"). Deleted with its book; updated_at kept by a trigger.

// Names besides their titles, by book id
const ALTERNATE_NAMES: Record<string, string[]> = {
  // Aristotle
  'aristotle-categories':                         ['Categoriae', 'Praedicamenta', 'De Praedicamentis'],
  'aristotle-eudemian-ethics':                    ['Ethica Eudemia', 'Ethics to Eudemus'],
  'aristotle-history-of-animals':                 ['Historia Animalium', 'De Historia Animalium'],
  'aristotle-metaphysics':                        ['Metaphysica', 'First Philosophy', "Aristotle's Metaphysics"],
  'aristotle-nicomachean-ethics':                 [
    'Ethica Nicomachea', 'Ethica ad Nicomachum', 'Ethics', 'Ethics to Nicomachus',
    "Aristotle's Ethics",
  ],
  'aristotle-on-breathing':                       ['De Respiratione', 'On Respiration'],
  'aristotle-on-dreams':                          ['De Insomniis'],
  'aristotle-on-generation-and-corruption':       [
    'De Generatione et Corruptione', 'On Coming-to-be and Passing-away',
  ],
  'aristotle-on-interpretation':                  ['De Interpretatione', 'Peri Hermeneias', 'Perihermeneias'],
  'aristotle-on-life-and-death':                  ['De Vita et Morte'],
  'aristotle-on-longevity-and-shortness-of-life': [
    'De Longitudine et Brevitate Vitae', 'On Length and Shortness of Life',
  ],
  'aristotle-on-memory-and-reminiscence':         ['De Memoria et Reminiscentia'],
  'aristotle-on-plants':                          ['De Plantis'],
  'aristotle-on-prophesying-by-dreams':           ['De Divinatione per Somnum', 'On Divination in Sleep'],
  'aristotle-on-sense-and-the-sensible':          ['De Sensu et Sensibilibus', 'De Sensu et Sensato'],
  'aristotle-on-sleep-and-sleeplessness':         ['De Somno et Vigilia', 'On Sleep and Waking'],
  'aristotle-on-sophistical-refutations':         [
    'De Sophisticis Elenchis', 'Sophistici Elenchi', 'Sophistical Refutations',
  ],
  'aristotle-on-virtues-and-vices':               ['De Virtutibus et Vitiis'],
  'aristotle-on-youth-and-old-age':               ['De Juventute et Senectute'],
  'aristotle-on-the-generation-of-animals':       ['De Generatione Animalium'],
  'aristotle-on-the-heavens':                     ['De Caelo', 'De Coelo', 'De Caelo et Mundo'],
  'aristotle-on-the-movement-of-animals':         ['De Motu Animalium'],
  'aristotle-on-the-parts-of-animals':            ['De Partibus Animalium'],
  'aristotle-on-the-progression-of-animals':      ['De Incessu Animalium', 'On the Gait of Animals'],
  'aristotle-on-the-soul':                        [
    'De Anima', 'Peri Psyches', 'On the Vital Principle', "Aristotle's Psychology",
    'Treatise on the Soul',
  ],
  'aristotle-physics':                            [
    'Physica', 'Physicae Auscultationes', 'De Physico Auditu', 'Lectures on Nature',
  ],
  'aristotle-poetics':                            ['Poetica', 'De Poetica', 'On the Art of Poetry'],
  'aristotle-politics':                           ['Politica'],
  'aristotle-posterior-analytics':                [
    'Analytica Posteriora', 'Posteriora Analytica', 'Second Analytics',
  ],
  'aristotle-prior-analytics':                    ['Analytica Priora', 'Priora Analytica', 'First Analytics'],
  'aristotle-rhetoric':                           ['Rhetorica', 'Ars Rhetorica', 'Art of Rhetoric'],
  'aristotle-the-athenian-constitution':          [
    'Athenaion Politeia', 'Constitution of the Athenians', 'Constitution of Athens',
  ],
  'aristotle-topics':                             ['Topica'],

  // Boethius, the Bible, Aquinas
  'boethius-consolation-of-philosophy': [
    'De Consolatione Philosophiae', 'Consolatio Philosophiae', 'Consolation of Philosophy',
  ],
  'douay-rheims':                       [
    'Douay-Rheims Bible', 'Douay Bible', 'Douai Bible', 'Douay Version', 'Holy Bible',
  ],
  'summa-theologiae':                   ['Summa Theologica', 'Summa', 'Sum. Theol.', 'S. Th.'],
  'summa-contra-gentiles':              [
    'Contra Gentiles', 'Summa contra Gentes', 'Summa de Veritate Catholicae Fidei contra Gentiles',
    'Cont. Gent.', 'C. G.',
  ],

  // Augustine
  'confessionsofsai0000augu':                                         ['Confessiones', 'Confessions'],
  'npnf101-the-confessions':                                          ['Confessiones', 'Confessions'],
  'npnf101-letters-of-st-augustin':                                   ['Epistulae', 'Epistolae', 'Letters of St. Augustine'],
  'npnf102-city-of-god':                                              [
    'De Civitate Dei', 'Civitas Dei', 'The City of God', 'De Civitate Dei contra Paganos',
    'De Civ. Dei',
  ],
  'npnf102-on-christian-doctrine':                                    ['De Doctrina Christiana', 'Christian Doctrine'],
  'npnf103-on-the-holy-trinity':                                      ['De Trinitate', 'On the Trinity', 'The Trinity'],
  'npnf103-the-enchiridion':                                          [
    'Enchiridion', 'Enchiridion ad Laurentium', 'Enchiridion de Fide, Spe et Caritate',
    'Handbook on Faith, Hope, and Love',
  ],
  'npnf103-a-treatise-on-faith-and-the-creed':                           ['De Fide et Symbolo'],
  'npnf103-concerning-faith-of-things-not-seen':                         ['De Fide Rerum quae non Videntur'],
  'npnf103-of-holy-virginity':                                           ['De Sancta Virginitate'],
  'npnf103-of-the-work-of-monks':                                        ['De Opere Monachorum'],
  'npnf103-on-care-to-be-had-for-the-dead':                              ['De Cura pro Mortuis Gerenda'],
  'npnf103-on-continence':                                               ['De Continentia'],
  'npnf103-on-lying':                                                    ['De Mendacio'],
  'npnf103-against-lying':                                               ['Contra Mendacium'],
  'npnf103-on-patience':                                                 ['De Patientia'],
  'npnf103-on-the-catechising-of-the-uninstructed':                      ['De Catechizandis Rudibus'],
  'npnf103-on-the-creed':                                                ['De Symbolo ad Catechumenos'],
  'npnf103-on-the-good-of-marriage':                                     ['De Bono Conjugali'],
  'npnf103-on-the-good-of-widowhood':                                    ['De Bono Viduitatis'],
  'npnf103-on-the-profit-of-believing':                                  ['De Utilitate Credendi'],
  'npnf104-acts-or-disputation-against-fortunatus-the-manich-an':        ['Contra Fortunatum', 'Acta contra Fortunatum Manichaeum'],
  'npnf104-against-the-epistle-of-manich-us-called-fundamental':         ['Contra Epistolam Manichaei quam Vocant Fundamenti'],
  'npnf104-answer-to-the-letters-of-petilian-the-donatist':              ['Contra Litteras Petiliani'],
  'npnf104-concerning-the-nature-of-good-against-the-manich-ans':        ['De Natura Boni'],
  'npnf104-on-baptism-against-the-donatists':                            ['De Baptismo contra Donatistas'],
  'npnf104-on-two-souls-against-the-manich-ans':                         ['De Duabus Animabus'],
  'npnf104-on-the-morals-of-the-catholic-church':                        ['De Moribus Ecclesiae Catholicae'],
  'npnf104-on-the-morals-of-the-manich-ans':                             ['De Moribus Manichaeorum'],
  'npnf104-reply-to-faustus-the-manich-an':                              ['Contra Faustum', 'Contra Faustum Manichaeum'],
  'npnf104-the-correction-of-the-donatists':                             ['De Correctione Donatistarum'],
  'npnf105-a-treatise-against-two-letters-of-the-pelagians':             ['Contra Duas Epistolas Pelagianorum'],
  'npnf105-a-treatise-concerning-man-s-perfection-in-righteousness':     ['De Perfectione Justitiae Hominis'],
  'npnf105-a-treatise-on-nature-and-grace':                              ['De Natura et Gratia'],
  'npnf105-a-treatise-on-rebuke-and-grace':                              ['De Correptione et Gratia'],
  'npnf105-a-treatise-on-the-grace-of-christ-and-on-original-sin':       ['De Gratia Christi et de Peccato Originali'],
  'npnf105-a-treatise-on-the-merits-and-forgiveness-of-sins-and-on-the': ['De Peccatorum Meritis et Remissione'],
  'npnf105-a-treatise-on-the-predestination-of-the-saints':              ['De Praedestinatione Sanctorum'],
  'npnf105-a-treatise-on-the-soul-and-its-origin':                       ['De Anima et ejus Origine'],
  'npnf105-a-treatise-on-the-spirit-and-the-letter':                     ['De Spiritu et Littera'],
  'npnf105-a-work-on-the-proceedings-of-pelagius':                       ['De Gestis Pelagii'],
  'npnf105-extract-from-augustin-s-retractations':                       ['Retractationes', 'Retractations'],
  'npnf105-on-marriage-and-concupiscence':                               ['De Nuptiis et Concupiscentia'],
  'npnf106-our-lord-s-sermon-on-the-mount':                              ['De Sermone Domini in Monte'],
  'npnf106-sermons-on-selected-lessons-of-the-new-testament':            ['Sermones'],
  'npnf106-the-harmony-of-the-gospels':                                  ['De Consensu Evangelistarum'],
  'npnf107-lectures-or-tractates-on-the-gospel-according-to-st-john':    [
    'In Joannis Evangelium Tractatus', 'Tractates on the Gospel of John', 'Tract. in Joan.',
  ],
  'npnf107-ten-homilies-on-the-first-epistle-of-john':                [
    'In Epistolam Joannis ad Parthos Tractatus', 'Tractates on the First Epistle of John',
  ],
  'npnf107-two-books-of-soliloquies':                                 ['Soliloquia', 'Soliloquies'],
  'npnf108-expositions-on-the-book-of-psalms':                        ['Enarrationes in Psalmos', 'Enarrations on the Psalms'],

  // Ambrose
  'npnf210-concerning-repentance':                 ['De Paenitentia', 'De Poenitentia'],
  'npnf210-concerning-virgins':                    ['De Virginibus'],
  'npnf210-concerning-widows':                     ['De Viduis'],
  'npnf210-exposition-of-the-christian-faith':     ['De Fide', 'De Fide ad Gratianum'],
  'npnf210-on-the-decease-of-his-brother-satyrus': ['De Excessu Fratris Satyri'],
  'npnf210-on-the-duties-of-the-clergy':           ['De Officiis Ministrorum', 'De Officiis'],
  'npnf210-on-the-holy-spirit':                    ['De Spiritu Sancto'],
  'npnf210-on-the-mysteries':                      ['De Mysteriis'],

  // Athanasius
  'npnf204-contra-gentes-against-the-heathen':            ['Oratio contra Gentes'],
  'npnf204-de-decretis-defence-of-the-nicene-definition': ['De Decretis Nicaenae Synodi'],
  'npnf204-on-the-incarnation-of-the-word':               ['De Incarnatione Verbi Dei', 'De Incarnatione'],
  'npnf204-life-of-antony-vita-antoni':                   ['Vita Antonii', 'Life of St. Antony'],
  'npnf204-festal-letters':                               ['Epistulae Festales'],

  // Basil
  'npnf208-de-spiritu-sancto': ['On the Holy Spirit'],
  'npnf208-the-hex-meron':     ['Hexaemeron', 'Homiliae in Hexaemeron'],

  // Clement of Alexandria and of Rome
  'anf02-exhortation-to-the-heathen':                      ['Protrepticus', 'Cohortatio ad Gentes', 'Exhortation to the Greeks'],
  'anf02-the-instructor':                                  ['Paedagogus', 'The Paedagogue', 'The Tutor'],
  'anf02-the-stromata-or-miscellanies':                    ['Stromata', 'Stromateis'],
  'anf02-who-is-the-rich-man-that-shall-be-saved':         ['Quis Dives Salvetur'],
  'anf01-first-epistle-to-the-corinthians':                ['1 Clement', 'First Clement'],
  'anf09-the-first-epistle-of-clement-to-the-corinthians': ['1 Clement', 'First Clement'],

  // Cyprian
  'anf05-an-address-to-demetrianus':                                    ['Ad Demetrianum'],
  'anf05-exhortation-to-martyrdom-addressed-to-fortunatus':             ['Ad Fortunatum de Exhortatione Martyrii'],
  'anf05-on-jealousy-and-envy':                                         ['De Zelo et Livore'],
  'anf05-on-works-and-alms':                                            ['De Opere et Eleemosynis'],
  'anf05-on-the-advantage-of-patience':                                 ['De Bono Patientiae'],
  'anf05-on-the-dress-of-virgins':                                      ['De Habitu Virginum'],
  'anf05-on-the-lapsed':                                                ['De Lapsis'],
  'anf05-on-the-lord-s-prayer':                                         ['De Dominica Oratione', 'De Oratione Dominica'],
  'anf05-on-the-mortality':                                             ['De Mortalitate'],
  'anf05-on-the-unity-of-the-church':                                   ['De Unitate Ecclesiae', 'De Catholicae Ecclesiae Unitate'],
  'anf05-on-the-vanity-of-idols-showing-that-the-idols-are-not-gods-a': [
    'Quod Idola Dii Non Sint', 'De Idolorum Vanitate',
  ],
  'anf05-the-epistles-of-cyprian':                     ['Epistolae', 'Letters of Cyprian'],
  'anf05-three-books-of-testimonies-against-the-jews': ['Testimonia ad Quirinum'],

  // Cyril of Jerusalem, Eusebius
  'npnf207-the-catechetical-lectures-of-s-cyril': ['Catecheses', 'Catechetical Lectures'],
  'npnf201-the-life-of-constantine':              ['Vita Constantini', 'De Vita Constantini'],
  'npnf201-martyrs-of-palestine':                 ['De Martyribus Palaestinae'],
  'npnf201-the-oration-of-eusebius':              ['Oratio de Laudibus Constantini', 'Tricennial Oration'],

  // Gregory of Nazianzus, of Nyssa, the Great, Thaumaturgus
  'npnf207-select-orations-of-saint-gregory-nazianzen': ['Orationes', 'Orations'],
  'npnf205-against-eunomius':                           ['Contra Eunomium'],
  'npnf205-the-great-catechism':                        ['Oratio Catechetica', 'Oratio Catechetica Magna', 'Catechetical Oration'],
  'npnf205-on-the-making-of-man':                       ['De Hominis Opificio', 'De Opificio Hominis'],
  'npnf205-on-the-soul-and-the-resurrection':           ['De Anima et Resurrectione'],
  'npnf205-on-virginity':                               ['De Virginitate'],
  'npnf205-on-not-three-gods':                          ['Quod non sint tres dii', 'Ad Ablabium'],
  'npnf205-on-infants-early-deaths':                    ['De Infantibus Praemature Abreptis'],
  'npnf212-the-book-of-pastoral-rule':                  [
    'Regula Pastoralis', 'Liber Regulae Pastoralis', 'Pastoral Care', 'Cura Pastoralis',
  ],
  'npnf212-register-of-the-epistles-of-st-gregory-the-great': ['Registrum Epistolarum'],
  'anf06-the-oration-and-panegyric-addressed-to-origen':      ['Panegyric to Origen', 'Oratio Panegyrica'],

  // Hermas, Hilary, Hippolytus
  'anf02-the-pastor-of-hermas':                  ['The Shepherd of Hermas', 'Shepherd of Hermas', 'Pastor Hermae'],
  'npnf209-homilies-on-the-psalms':              ['Tractatus super Psalmos'],
  'anf05-the-refutation-of-all-heresies':        ['Refutatio Omnium Haeresium', 'Philosophumena', 'Elenchos'],
  'anf05-treatise-on-christ-and-antichrist':     ['De Christo et Antichristo'],
  'anf05-against-the-heresy-of-one-noetus':      ['Contra Noetum', 'Against Noetus'],

  // Ignatius, Polycarp, Irenaeus, Barnabas, Diognetus, the Didache
  'anf01-epistle-to-the-ephesians-shorter-and-longer-versions':      ['Ignatius to the Ephesians', 'Ad Ephesios'],
  'anf01-epistle-to-the-magnesians-shorter-and-longer-versions':     ['Ignatius to the Magnesians', 'Ad Magnesios'],
  'anf01-epistle-to-the-trallians-shorter-and-longer-versions':      ['Ignatius to the Trallians', 'Ad Trallianos'],
  'anf01-epistle-to-the-romans-shorter-and-longer-versions':         ['Ignatius to the Romans', 'Ad Romanos'],
  'anf01-epistle-to-the-philadelphians-shorter-and-longer-versions': ['Ignatius to the Philadelphians', 'Ad Philadelphenses'],
  'anf01-epistle-to-the-smyrn-ans-shorter-and-longer-versions':      ['Ignatius to the Smyrnaeans', 'Ad Smyrnaeos'],
  'anf01-epistle-to-polycarp-shorter-and-longer-versions':           ['Ignatius to Polycarp', 'Ad Polycarpum'],
  'anf01-epistle-to-the-philippians':                                [
    'Epistle of Polycarp to the Philippians', 'Polycarp to the Philippians', 'Ad Philippenses',
  ],
  'anf01-the-martyrdom-of-polycarp':               ['Martyrium Polycarpi'],
  'anf01-against-heresies':                        [
    'Adversus Haereses', 'Contra Haereses', 'Adv. Haer.',
    'Detection and Overthrow of Knowledge Falsely So Called',
  ],
  'anf01-the-epistle-of-barnabas':                 ['Epistola Barnabae', 'Epistle of Barnabas'],
  'anf01-epistle-to-diognetus':                    ['Epistola ad Diognetum', 'Letter to Diognetus'],
  'anf07-the-teaching-of-the-twelve-apostles':     ['Didache', 'Didache ton Dodeka Apostolon'],
  'anf07-constitutions-of-the-holy-apostles':      ['Apostolic Constitutions', 'Constitutiones Apostolicae'],
  'anf08-the-protevangelium-of-james':             [
    'Protoevangelium of James', 'Gospel of James', 'Infancy Gospel of James',
  ],

  // Jerome, Gennadius, Rufinus, Pamphilus
  'npnf206-against-jovinianus':                                        ['Adversus Jovinianum'],
  'npnf206-against-vigilantius':                                       ['Contra Vigilantium'],
  'npnf206-against-the-pelagians':                                     ['Dialogi contra Pelagianos'],
  'npnf203-jerome-s-apology-for-himself-against-the-books-of-rufinus': ['Apologia adversus Libros Rufini'],
  'npnf203-jerome-lives-of-illustrious-men':                           ['De Viris Illustribus'],
  'npnf206-the-dialogue-against-the-luciferians':                      ['Altercatio Luciferiani et Orthodoxi', 'Dialogus contra Luciferianos'],
  'npnf206-the-letters-of-st-jerome':                                  ['Epistolae', 'Letters of St. Jerome'],
  'npnf206-the-life-of-malchus-the-captive-monk':                      ['Vita Malchi'],
  'npnf206-the-life-of-paulus-the-first-hermit':                       ['Vita Pauli'],
  'npnf206-the-life-of-s-hilarion':                                    ['Vita Hilarionis'],
  'npnf206-the-perpetual-virginity-of-blessed-mary':                   [
    'Adversus Helvidium', 'Against Helvidius', 'De Perpetua Virginitate Beatae Mariae',
  ],
  'npnf206-to-pammachius-against-john-of-jerusalem':    ['Contra Joannem Hierosolymitanum'],
  'npnf203-gennadius-lives-of-illustrious-men':         ['De Viris Illustribus'],
  'npnf203-a-commentary-on-the-apostles-creed':         ['Commentarius in Symbolum Apostolorum', 'Expositio Symboli'],
  'npnf203-translation-of-pamphilus-defence-of-origen': ['Apologia pro Origene'],

  // John Cassian, John Chrysostom, John of Damascus
  'npnf211-the-conferences-of-john-cassian':                              ['Collationes', 'Conferences'],
  'npnf211-the-twelve-books-on-the-institutes-of-the-c-nobia-and-the-re': ['De Institutis Coenobiorum', 'Institutes'],
  'npnf211-the-seven-books-of-john-cassian-on-the-incarnation-of-the-lo': [
    'De Incarnatione Domini contra Nestorium',
  ],
  'npnf109-treatise-concerning-the-christian-priesthood':         ['De Sacerdotio', 'On the Priesthood'],
  'npnf109-the-homilies-on-the-statues-to-the-people-of-antioch': [
    'Homilies on the Statues', 'De Statuis', 'Ad Populum Antiochenum',
  ],
  'npnf109-instructions-to-catechumens':                                 ['Catecheses ad Illuminandos'],
  'npnf109-letter-to-a-young-widow':                                     ['Ad Viduam Juniorem'],
  'npnf109-an-exhortation-to-theodore-after-his-fall':                   ['Ad Theodorum Lapsum'],
  'npnf110-the-homilies-of-st-john-chrysostom':                          ['Homilies on Matthew', 'Homiliae in Matthaeum'],
  'npnf111-a-commentary-on-the-acts-of-the-apostles':                    ['Homilies on Acts', 'Homiliae in Acta Apostolorum'],
  'npnf111-the-homilies-of-st-john-chrysostom-on-paul-s-epistle-to-the': [
    'Homilies on Romans', 'Homiliae in Epistolam ad Romanos',
  ],
  'npnf112-homilies-on-first-corinthians':                                ['Homilies on 1 Corinthians'],
  'npnf112-homilies-on-second-corinthians':                               ['Homilies on 2 Corinthians'],
  'npnf114-the-homilies-of-st-john-chrysostom-on-the-epistle-to-the-heb': [
    'Homilies on Hebrews', 'Homiliae in Epistolam ad Hebraeos',
  ],
  'npnf114-the-homilies-of-st-john-chrysostom-on-the-gospel-of-st-john': [
    'Homilies on John', 'Homiliae in Joannem',
  ],
  'npnf209-an-exact-exposition-of-the-orthodox-faith': [
    'De Fide Orthodoxa', 'Expositio Fidei Orthodoxae', 'Exposition of the Orthodox Faith',
  ],

  // Justin Martyr, Lactantius, Leo
  'anf01-dialogue-with-trypho':                                ['Dialogus cum Tryphone Judaeo', 'Dialogue with Trypho the Jew'],
  'anf01-the-first-apology':                                   ['Apologia Prima', '1 Apology', 'First Apology of Justin'],
  'anf01-the-second-apology':                                  ['Apologia Secunda', '2 Apology', 'Second Apology of Justin'],
  'anf01-hortatory-address-to-the-greeks':                     ['Cohortatio ad Graecos'],
  'anf01-the-discourse-to-the-greeks':                         ['Oratio ad Graecos'],
  'anf01-on-the-sole-government-of-god':                       ['De Monarchia'],
  'anf07-a-treatise-on-the-anger-of-god-addressed-to-donatus': ['De Ira Dei'],
  'anf07-of-the-manner-in-which-the-persecutors-died':         ['De Mortibus Persecutorum'],
  'anf07-on-the-workmanship-of-god-or-the-formation-of-man':   ['De Opificio Dei'],
  'anf07-the-epitome-of-the-divine-institutes':                ['Epitome Divinarum Institutionum'],
  'npnf214-the-tome-of-st-leo':                                ['Tomus ad Flavianum', 'Tome of Leo', 'Epistola Dogmatica ad Flavianum'],
  'npnf212-letters':                                           ['Epistolae', 'Letters of Leo the Great'],
  'npnf212-sermons':                                           ['Sermones', 'Tractatus', 'Sermons of Leo the Great'],

  // Methodius, Minucius Felix, Novatian, Origen
  'anf06-the-banquet-of-the-ten-virgins-or-concerning-chastity': ['Symposium', 'Convivium Decem Virginum'],
  'anf06-concerning-free-will':                                  ['De Libero Arbitrio'],
  'anf04-the-octavius-of-minucius-felix':                        ['Octavius'],
  'anf05-a-treatise-of-novatian-concerning-the-trinity':         ['De Trinitate'],
  'anf05-on-the-jewish-meats':                                   ['De Cibis Judaicis'],
  'anf04-origen-against-celsus':                                 ['Contra Celsum', 'Against Celsus'],
  'anf04-origen-de-principiis':                                  ['De Principiis', 'Peri Archon', 'On First Principles'],
  'anf09-origen-s-commentary-on-matthew':                        ['Commentarium in Matthaeum'],
  'anf09-origen-s-commentary-on-the-gospel-of-john':             ['Commentarium in Joannem'],

  // Pseudo-Clement, Socrates, Sozomen, Sulpicius Severus, Tatian, Theophilus
  'anf08-the-recognitions-of-clement':                                  ['Recognitiones', 'Clementine Recognitions'],
  'npnf202-the-ecclesiastical-history-of-socrates-scholasticus':        ['Historia Ecclesiastica', 'Church History'],
  'npnf202-the-ecclesiastical-history-of-sozomen':                      ['Historia Ecclesiastica', 'Church History'],
  'npnf203-the-ecclesiastical-history-of-theodoret':                    ['Historia Ecclesiastica', 'Church History'],
  'npnf203-the-immutable':                                              ['Eranistes'],
  'npnf203-the-unconfounded':                                           ['Eranistes'],
  'npnf203-the-impassible':                                             ['Eranistes'],
  'npnf211-on-the-life-of-st-martin':                                   ['Vita Sancti Martini', 'Vita Martini'],
  'npnf211-dialogues-of-sulpitius-severus':                             ['Dialogi'],
  'npnf211-the-sacred-history-of-sulpitius-severus':                    ['Chronica', 'Historia Sacra'],
  'anf02-address-to-the-greeks':                                        ['Oratio ad Graecos'],
  'anf02-theophilus-to-autolycus':                                      ['Ad Autolycum', 'To Autolycus'],
  'anf02-a-plea-for-the-christians':                                    ['Legatio pro Christianis', 'Embassy for the Christians'],
  'anf02-the-resurrection-of-the-dead':                                 ['De Resurrectione Mortuorum'],
  'anf06-the-seven-books-of-arnobius-against-the-heathen-adversus-gen': [
    'Adversus Nationes', 'Against the Heathen',
  ],

  // Tertullian
  'anf03-a-treatise-on-the-soul':                                 ['De Anima'],
  'anf03-ad-martyras':                                            ['To the Martyrs'],
  'anf03-ad-nationes':                                            ['To the Nations', 'To the Heathen'],
  'anf03-against-hermogenes':                                     ['Adversus Hermogenem'],
  'anf03-against-praxeas':                                        ['Adversus Praxean'],
  'anf03-against-the-valentinians':                               ['Adversus Valentinianos'],
  'anf03-an-answer-to-the-jews':                                  ['Adversus Judaeos'],
  'anf03-apology':                                                ['Apologeticus', 'Apologeticum', 'Apology of Tertullian'],
  'anf04-de-fuga-in-persecutione':                                ['On Flight in Persecution'],
  'anf03-on-baptism':                                             ['De Baptismo'],
  'anf04-on-exhortation-to-chastity':                             ['De Exhortatione Castitatis'],
  'anf04-on-fasting':                                             ['De Jejunio'],
  'anf03-on-idolatry':                                            ['De Idololatria'],
  'anf04-on-modesty':                                             ['De Pudicitia'],
  'anf04-on-monogamy':                                            ['De Monogamia'],
  'anf03-on-patience':                                            ['De Patientia'],
  'anf03-on-prayer':                                              ['De Oratione'],
  'anf03-on-repentance':                                          ['De Paenitentia', 'De Poenitentia'],
  'anf04-on-the-apparel-of-women':                                ['De Cultu Feminarum'],
  'anf03-on-the-flesh-of-christ':                                 ['De Carne Christi'],
  'anf04-on-the-pallium':                                         ['De Pallio'],
  'anf03-on-the-resurrection-of-the-flesh':                       ['De Resurrectione Carnis'],
  'anf04-on-the-veiling-of-virgins':                              ['De Virginibus Velandis'],
  'anf03-scorpiace':                                              ["Antidote for the Scorpion's Sting"],
  'anf03-the-five-books-against-marcion':                         ['Adversus Marcionem', 'Against Marcion'],
  'anf03-the-prescription-against-heretics':                      ['De Praescriptione Haereticorum', 'Prescription of Heretics'],
  'anf03-the-soul-s-testimony':                                   ['De Testimonio Animae'],
  'anf04-to-his-wife':                                            ['Ad Uxorem'],
  'anf03-to-scapula':                                             ['Ad Scapulam'],
  'anf03-the-passion-of-the-holy-martyrs-perpetua-and-felicitas': [
    'Passio Perpetuae et Felicitatis', 'Passion of Perpetua and Felicity',
  ],

  // Vincent of Lérins, the councils, the Syriac fathers
  'npnf211-the-commonitory-of-vincent-of-le-rins-for-the-antiquity-and': ['Commonitorium', 'Commonitory'],
  'anf07-the-nicene-creed':                                              ['Symbolum Nicaenum', 'Creed of Nicaea'],
  'npnf214-the-nicene-creed':                                            ['Symbolum Nicaenum', 'Creed of Nicaea'],
  'npnf214-the-definition-of-faith-of-the-council-of-chalcedon':         [
    'Chalcedonian Definition', 'Definition of Chalcedon',
  ],
  'npnf213-aphrahat-select-demonstrations':   ['Demonstrations'],
  'npnf213-ephraim-syrus-the-nisibene-hymns': ['Carmina Nisibena', 'Nisibene Hymns'],

  // Modern works known by their original titles or nicknames
  'saint-thomas-aquinas-by-g-k-chesterton':   ['The Dumb Ox', 'St. Thomas Aquinas: The Dumb Ox'],
  'enchiridionsymbo00denz_0':                 ['Enchiridion Symbolorum', 'Denzinger'],
  'philosophyofstth00gils_0':                 ['Le Thomisme', 'Thomism'],
  'The-Degrees-Of-Knowledge':                 ['Distinguish to Unite', 'Les Degrés du savoir'],
  'god_his_existance_1':                      ['Dieu, son existence et sa nature'],
  'god_his_existance_2':                      ['Dieu, son existence et sa nature'],
};

const capitalized = (name: string) => name.charAt(0).toUpperCase() + name.slice(1);

// A title naming the book two ways, each: "Against the Arians. (Orationes contra
// Arianos IV.)", "The Stromata, or Miscellanies", "De Synodis or On the
// Councils". [] for a title naming it one way, or whose brackets only say it
// goes on ("Session II. (Continued)").
const titleParts = (title: string): string[] => {
  const bracketed = title.match(/^(.+?)\.?\s*\((.+?)\.?\)$/);
  const either    = title.match(/^(.+?)(?:[,;]\s*or,?|\s+or)\s+(.+)$/);

  if (bracketed !== null) {
    return /^continued$/i.test(bracketed[2]!) ? [] : [bracketed[1]!, bracketed[2]!];
  }
  else if (either !== null && /[,;]\s*or\b|\sor\s+(?:De|On)\s/.test(title)) {
    return [either[1]!, capitalized(either[2]!)];
  }
  else {
    return [];
  }
};

const updatedAtTrigger = async(db: Kysely<unknown>, table: string) => {
  await sql`create function ${ sql.raw(table) }_set_updated_at() returns trigger as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$ language plpgsql`.execute(db);

  await sql`create trigger ${ sql.raw(table) }_updated_at
    before update on ${ sql.table(table) }
    for each row execute function ${ sql.raw(table) }_set_updated_at()`.execute(db);
};

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create table alternate_book_names (
    id bigserial primary key,
    book_id text not null references books(id) on delete cascade,
    name text not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  )`.execute(db);
  await sql`create unique index alternate_book_names_book_name_idx
    on alternate_book_names (book_id, lower(name))`.execute(db);
  await sql`create index alternate_book_names_name_idx
    on alternate_book_names (lower(name))`.execute(db);
  await updatedAtTrigger(db, 'alternate_book_names');

  const books = (await sql<{ id: string, title: string }>`select id, title from books`
    .execute(db)).rows;

  const rows = books.flatMap((book) => {
    const all = [book.title, ...titleParts(book.title), ...(ALTERNATE_NAMES[book.id] ?? [])]
      .map((n) => n.trim())
      .filter((n) => n.length > 0);
    return all
      .filter((n, i) => all.findIndex((m) => m.toLowerCase() === n.toLowerCase()) === i)
      .map((name) => sql`(${ book.id }, ${ name })`);
  });

  for (let i = 0; i < rows.length; i += 500) {
    await sql`insert into alternate_book_names (book_id, name)
      values ${ sql.join(rows.slice(i, i + 500)) }`.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop table alternate_book_names`.execute(db);
  await sql`drop function alternate_book_names_set_updated_at()`.execute(db);
}
