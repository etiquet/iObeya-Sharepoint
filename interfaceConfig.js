/***

 section : Paramétrage généraux de l'interface

 ***/

var DATE_FORMAT = 'dd/MM/yyyy';

// dimension d'une note (grande taille)
var NOTE_DEFAULT_COLOR = 16772735;
var NOTE_WARNING_COLOR = 16488575;
var NOTE_DEFAULT_WIDTH = 375;
var NOTE_DEFAULT_HEIGHT = 225;

//Prise en compte des cards (grande taille) //v1.18
var CARD_DEFAULT_COLOR = 0xfef5be;
var CARD_WARNING_COLOR = 0xfa977e;
var CARD_DEFAULT_WIDTH = 379;
var CARD_DEFAULT_HEIGHT = 297;

var LABEL_DEFAULT_COLOR = 3355443;
var LABEL_DEFAULT_FONT_COLOR = 16777215;
var LABEL_DEFAULT_WIDTH = 225;
var LABEL_DEFAULT_HEIGHT = 60;
var LABEL_POSITION_MARGIN_TOP = 20;
var LABEL_DEFAULT_SETNAME = "Label";
var LABEL_DEFAULT_NAME = "Acteurs";

var STICKER_DEFAULT_WIDTH = 257;
var STICKER_DEFAULT_HEIGHT = 64; // corrigé

var NOTE_DEFAULT_MARGIN_TOP  = 150;
var NOTE_DEFAULT_MARGIN  = 20;
var NOTE_STACK_MARGIN  = 70;

var TOLERANCEINTERVAL = 10000; // temps minimum pour prendre en compte une modification

var IOBEYA_URL_PATH_1 = "/s/download/resources/client-html-plugin/";
var IOBEYA_URL_PATH_2 = "/public/#/fr/board/";

var CLONED_NOTE_PREFIX = 'cloned_';
var RIDA_CREATED_NOTE_PREFIX = 'rida_';

/***
 Section : Paramétrage spécificiques aux plateformes
 commenter / décommenter les sections selon la plateforme
 ***/

// Paramétrage iObeya


var SYNC_PROPERTIES_MAP = {
    'default': {
        'TAXONOMY_ID' : '47054502770442c58d2e27173b0a6dab',  // "Collection de sites - devptf.sharepoint.com-sites-pfe dev Capgemini "
        'ACTORSSET_ID' : '62bc99d5-39ae-4cae-9d6d-4e5c00c2ae30', // "ActeurTerme" TERMSET
        'ACTORSSUBSET_ID' : ["157a0c3f-2085-4f56-b224-85771c3c3af1", "44259241-48cc-407c-92fb-803ee33c6d16", "d19c768a-5e41-44f7-8ed7-d05216f62770", "0cc10e7e-117c-4a43-a9fe-7b5d78c89979"], // Important : doit être dans le même ordre que la liste des panneaux à synchroniser...
        'USE_ACTORSSUBSETLIST' : 'false', // utilisation ou pas des sous-listes de la taxonomie des acteurs. ( si false le terme : ACTORSSET_ID est utilisé )
        'IOBEYAURL' : 'https://10.211.55.36', //ptf @cap en 3.4
        'ROOM_NAME' : 'PROJETS-TEST', //ptf @cap en 3.4
        'BOARDSTOSYNC' :  [ // Tableaux de iObeya utilisés
            'SuiviCoproj',
            'SuiviBSU',
            'SuiviBOE',
            'SuiviCOT' ] ,
        'DROP_ZONE' : "A faire",
        'RESOURCES_ZONE' : "Ressources",
        'DELETED_STATUS' : "Supprimé",
        'LISTSHAREPOINT_TITLE' : "RIDA suivi de projet", // attention aux espaces
        'LISTLOG_TITLE' : "lst_logsyncactions", // attention aux espaces
        'RIDALIST_URL' : '/sites/pfe/Lists/RIDA v2/MyItems.aspx',
        'ACTORLIST_TITLE' : 'lst_acteurs', // attention aux espaces
        'AUTOUPDATE_DUEDATE' : 'true', // si absent ou #true => si la due date > date du jour => ajustement de la date à ce  jour.
        'SHAREPOINTLIST_MATCHINGNAME': {
            "actortax" : "Acteurs", // ancien nom de colonne acteurs
            "actor" : 'acteurs0', // nouveau nom de colonne acteurs
            "startDate" : "StartDate",
            "dueDate" : "DueDate",
            "status" : "Status",
            "subject" : "Title",
            "synchroiObeya" : "Synchro_x0020_Iobeya",
            "percentComplete" : "PercentComplete",
            "modificationDate" : "Modified",
            "creationDate" : "Created",
            "modifier" : "Editor",
            "priority" : "Priority",
            "creator" : "Author",
            "idiObeya" : "idiObeya",
            "synchroStatus" : "Statut_x0020_synchro",
            "workload" : "Charge",
            "resteafaire" : "RAF",
            "firmDeadline" : "Ech_x00e9_ance_x0020_ferme",
            "consomme" : "consomme",
            "PanneauiObeya" : "PanneauiObeya",
            "projet" : "projet",
            "chantier" : "chantier",
            "datecreation" : "datecreation",
            "datestamp" : "datestamp",
            "datecreation" : "datecreation",
            "idrida" : "idrida", // id de l'object source
            "linkUrl" : "linkUrl",
            "syncaction" : "syncaction",
            "description" : "Body",		// Description de de la tâche
            "details" : "details"		// Liste de sous-tâche ( converti dans le cas d'une card )
        },
        'ACTORLIST_MATCHINGNAME': { // table de correspondance des colonnes de la liste SP
            "actor" : "Acteur",
            "PanneauiObeya" : "PanneauiObeya"
        },
        'PERCENTAGE_IOBEYASTICKER_MAPPING' :  {
            "setName" : "Avancement",
            "map" :  {
                "0%" : {"name" : "0%"},
                "10%" : {"name" : "10%"},
                "20%" : {"name" : "20%"},
                "30%" : {"name" : "30%"},
                "40%" : {"name" : "40%"},
                "50%" : {"name" : "50%"},
                "60%" : {"name" : "60%"},
                "70%" : {"name" : "70%"},
                "80%" : {"name" : "80%"},
                "90%" : {"name" : "90%"},
                "100%" : {"name" : "100%"}
            }
        },
        'PRIORITY_IOBEYASTICKER_MAPPING' : {
            "setName" : "Choices",
            "map" :  {
                "Haute" : {"name" : "Haute"},
                "Normale" : {"name" : "Normale"},
                "Faible" : {"name" : "Faible"}
            }
        },
        //important : les noms de board target sont uniques entre les #plateformes connectées
        'ESCALLATION_MAPPING': {
            "setName": "Escallation",
            "map": {
                "Orange": {
                    "target_url" :"https://10.211.55.36",
                    "target_room" : "PROJETS-TEST",
                    "target_board" : "SuiviCoproj",
                    "target_dropZone": "Point d'attention"
                },
                "Blue": {
                    "target_url" : "https://10.211.55.36", //ptf @cap en 3.4
                    "target_room" : "PROJETS-TEST",
                    "target_board" : "SuiviBSU",
                    "target_dropZone": "Point d'attention"
                },
                "Green": {
                    "target_url" : "https://10.211.55.36", //ptf @cap en 3.4
                    "target_room" : "PROJETS-TEST",
                    "target_board" : "SuiviBOE",
                    "target_dropZone": "Point d'attention"
                },
                "Red": {
                    "target_url" : "https://10.211.55.36", //ptf @cap en 3.4
                    "target_room" : "PROJETS-TEST",
                    "target_board" : "Developpement - Interne",
                    "target_dropZone": "Point d'attention"
                }
            }
        },
        'IOBEYANOTE_MAPPING' : {
            'title': { // dans iObeya: champ en haut
                'iobeya_parent': 'props',
                'type': 'concat',
                'rida_field': ['projet', 'chantier'],
                'concatString': '::',
                'emptyString': '***'
            },
            'content': {  // dans iObeya: champ du centre
                'iobeya_parent': 'props',
                'type': 'text',
                'rida_field': 'subject'
            },
            'responsible': {  // dans iObeya: champ en bas à gauche
                'iobeya_parent': 'props',
                'type': 'numeric',
                'rida_field': 'resteafaire',
                'unit': ' J/H (RAF)'
            },
            'date': {  // dans iObeya: champ en bas à droite
                'iobeya_parent': 'props',
                'type': 'date',
                'rida_field': 'dueDate'
            },
            'workload': {  // dans iObeya: champ invisible
                'iobeya_parent': 'props',
                'type': 'numeric',
                'rida_field': 'workload',
                'unit': ' J/H (Estim)'
            }
        } // 'IOBEYANOTE_MAPPING'
    }, // default
    'second': {
        'inherits': 'default',
        'BOARDSTOSYNC' :  [ // Tableaux de iObeya utilisés
            'Developpement - Interne' ] ,
        'LISTSHAREPOINT_TITLE' : "RIDA Interne", // attention aux espaces
        'RIDALIST_URL' : '/sites/pfe/Lists/RIDA Interne/MyItems.aspx',
    },
    'third': {
        'inherits': 'default',
        'BOARDSTOSYNC' :  [ // Tableaux de iObeya utilisés
            'Programme - Acceleration' ] ,
        'LISTSHAREPOINT_TITLE' : "Chantier Program Acceleration", // attention aux espaces
        'RIDALIST_URL' : '/sites/pfe/Lists/Chantier Program Acceleration/MyItems.aspx',
    },
	'dgsic': {
        'inherits': 'default',
        'BOARDSTOSYNC' :  [ // Tableaux de iObeya utilisés
            'Defense-Plateforme' ] ,
        'LISTSHAREPOINT_TITLE' : "SUIVI-Defense-Plateforme", // attention aux espaces
        'RIDALIST_URL' : '/sites/pfe/Lists/DGSIC/MyItems.aspx',
    }
};

// Enumération contenant l'ensemble des actions de synchronisation
var syncType = {
    todo_nothing: 0,
    todo_createiObeya: 1,
    todo_createRida: 2,
    todo_synciObeya: 3,
    todo_syncRida: 4,
    todo_removeiObeya: 5,
    todo_removeRida: 6,
    todo_moveBoardiObeya: 7,
    todo_cloneiObeya: 8,

    // "Mapping" de l'énumération utilisé pour écrire dans la list sharepoint "lst_logsyncactions" (colonne syncaction)
    properties : {
        0: {name: "Nothing"},
        1: {name: "Created in iObeya"},
        2: {name: "Created in Rida"},
        3: {name: "Synchronized iObeya"},
        4: {name: "Synchronized from Rida"},
        5: {name: "Removed from iObeya"},
        6: {name: "Removed from Rida"},
        7: {name: "Board moved in iObeya"},
        8: {name: "Note cloned in iOneya"}
    }
};