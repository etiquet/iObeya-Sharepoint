/*** 
	
	section : Paramétrage généraux de l'interface
	
***/

var dateFormat = 'dd/MM/yyyy';
var dateLargeFormat = 'dd/MM/yyyy h:i';

var NOTE_DEFAULT_COLOR = 16772735;
var NOTE_WARNING_COLOR = 16488575;
var NOTE_DEFAULT_WIDTH = 375;
var NOTE_DEFAULT_HEIGHT = 225;

var LABEL_DEFAULT_COLOR = 3355443;
var LABEL_DEFAULT_FONT_COLOR = 16777215;
var LABEL_DEFAULT_WIDTH = 225;
var LABEL_DEFAULT_HEIGHT = 60;

var LABEL_POSITION_MARGIN_TOP = 20;

var LABEL_DEFAULT_SETNAME = "Label";
var LABEL_DEFAULT_NAME = "Ressource";

var STICKER_DEFAULT_WIDTH = 112;
var STICKER_DEFAULT_HEIGHT = 112;

var stackNotes = [];

var NOTE_DEFAULT_MARGIN_TOP  = 150;
var NOTE_DEFAULT_MARGIN  = 20;
var NOTE_STACK_MARGIN  = 70;

var TOLERANCEINTERVAL = 10000; // temps minimum pour prendre en compte une modification

/*** 
	
	Section : Paramétrage spécificiques aux plateformes
	commenter / décommenter les sections selon la plateforme
	
***/

// Paramétrage iObeya

var IOBEYAURL = "https://devptf.iobeya.com";		
var BOARDSTOSYNC = ["SuiviCoProj", "SuiviBSU", "SuiviBOE", "SuiviCOT"]; // Tableaux de iObeya

var ROOM_NAME = "CAP - SIAé";
var DROP_ZONE = "A faire";
var RESOURCES_ZONE = "Ressources";
var DELETED_STATUS = "Supprimé";

// Paramétrage Sharepoint

var LISTSHAREPOINT_TITLE = "RIDA suivi de projet";
var RIDALIST_URL = '/sites/pfe/Lists/RIDA v2/MyItems.aspx';
var TAXONOMY_ID = "47054502770442c58d2e27173b0a6dab"; // "Collection de sites - devptf.sharepoint.com-sites-pfe dev Capgemini "
var ACTORSSET_ID = "62bc99d5-39ae-4cae-9d6d-4e5c00c2ae30"; // "ActeurTerme" TERMSET
var ACTORSSUBSET_ID = ["157a0c3f-2085-4f56-b224-85771c3c3af1", "44259241-48cc-407c-92fb-803ee33c6d16", "d19c768a-5e41-44f7-8ed7-d05216f62770", "0cc10e7e-117c-4a43-a9fe-7b5d78c89979"];  // Important : doit être dans le même ordre que la liste des panneaux à synchroniser...
var USE_ACTORSSUBSETLIST = false; // utilisation ou pas des sous-listes de la taxonomie des acteurs. ( si false le terme : ACTORSSET_ID est utilisé )

// Tableaux de correspondance Sharepoint / iObeya

var SHAREPOINTLIST_MATCHINGNAME = {
	"actor" : "Acteurs",
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
	"PanneauiObeya" : "PanneauiObeya"
};

// Table de correspondance % achevé
var PERCENTAGE_IOBEYASTICKER_MAPPING =  {
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
};

// Table de correspondance Priorité :

var PRIORITY_IOBEYASTICKER_MAPPING = {
	"setName" : "Choices",
	"map" :  {
		"Haute" : {"name" : "Haute"},
		"Normale" : {"name" : "Normale"},
		"Faible" : {"name" : "Faible"}
	}
};
