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


/*** 
	
	Section : Paramétrage spécificiques aux plateformes
	commenter / décommenter les sections selon la plateforme
	
***/


/*** 
	
	Section : Paramétrage plateforme Capgemini
	
***/

/*** Paramétrage plateforme Dev Capgemini ***/
// Paramétrage iObeya

var iObeyaURL = "https://devptf.iobeya.com";		
// var BOARD_NAME = "SuiviCoproj"; // ENV CAPGEMINI // TODO: cette variable doit être supprimée ?
// Tableaux de iObeya
var boardsToSync = ["SuiviCoProj", "SuiviBSU", "SuiviBOE", "SuiviCOT"];

var ROOM_NAME = "CAP - SIAé";
var DROP_ZONE = "A faire";
var RESOURCES_ZONE = "Ressources";
var DELETED_STATUS = "Supprimé";

// Paramétrage Sharepoint

var listTitle = "RIDA suivi de projet";
var siteUrl = '/sites/pfe';
var ridaUrl = '/sites/pfe/Lists/RIDA v2/MyItems.aspx';

var taxonomyId = "47054502770442c58d2e27173b0a6dab"; // "Collection de sites - devptf.sharepoint.com-sites-pfe dev Capgemini "
var actorsSetId = "62bc99d5-39ae-4cae-9d6d-4e5c00c2ae30"; // "ActeurTerme" TERMSET
var actorsSubSetId = '157a0c3f-2085-4f56-b224-85771c3c3af1'; // "SIAé" TODO: a decommissioner ???
var actorsSubSetIdList = ["157a0c3f-2085-4f56-b224-85771c3c3af1", "44259241-48cc-407c-92fb-803ee33c6d16", "d19c768a-5e41-44f7-8ed7-d05216f62770", "0cc10e7e-117c-4a43-a9fe-7b5d78c89979"];  // Important : doit être dans le même ordre que la liste des panneaux à synchroniser...
var UseActorsSubSetList = false; // utilisation ou pas des sous-listes de la taxonomie des acteurs. ( si false le terme : actorsSetId est utilisé )

// Tableaux de correspondance Sharepoint / iObeya

var dataToSynchronize = {
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
var percentageStickerMapping =  {
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

var priorityStickerMapping = {
	"setName" : "Choices",
	"map" :  {
		"Haute" : {"name" : "Haute"},
		"Normale" : {"name" : "Normale"},
		"Faible" : {"name" : "Faible"}
	}
};


/***  

	SECTION :: Paramétrage environnement SIAé
	
***/

// *** paramètres iObeya SIAe

//var iObeyaURL = "https://iobeya.siae.intradef.gouv.fr/iobeya/";  // production
//var iObeyaURL = "https://iobeya-test.siae.intradef.gouv.fr/iobeya"; // preproduction 

/*** propriétés panneau iObeya SIAé	***/
//var BOARD_NAME = "SuiviCoproj";
//var ROOM_NAME = "DSI";

/*** Paramétrage Sharepoint dev 

//var siteUrl = '/';
//var ridaUrl = 'https://pfe-dev.siae.intradef.gouv.fr/Lists/RIDA suivi de projet/AllItems.aspx';
//var taxonomyId = "3cac142caa9c4a6183129b7318cf69b5"; // "Collection de sites - Plateforme dev SIAé "
//var actorsSetId = "653b17b1-bd0b-4cd0-87e0-0d29a9d1d69b"; // "ActeurTerme"
//var actorsSubSetId = "d84a1028-570d-407a-8c56-3817301a0d9f"; // "SIAé"


// *** tableau de correspondance Sharepoint / iObeya

/*** environnement de développement SIAé ***/
//var dataToSynchronize = {
//	"actor" : "Acteurs",
//	"startDate" : "StartDate",
//	"dueDate" : "DueDate",
//	"status" : "Statut_x0020_RIDA",
//	"subject" : "Title",
//	"synchroiObeya" : "Synchro_x0020_iObeya",
//	"percentComplete" : "PercentComplete",
//	"modificationDate" : "Modified",
//	"creationDate" : "Created",
//	"modifier" : "Editor",
//	"priority" : "Priority",
//	"creator" : "Author",
//	"idiObeya" : "idiObeya",
//	"synchroStatus" : "Statut_x0020_Synchro",
//	"workload" : "Charge",
//	"firmDeadline" : "Ech_x00e9_ance_x0020_ferme"
//};


/*** environnement de développement SIAé ***/
//var priorityStickerMapping = {
//	"setName" : "Criticality",
//	"map" :  {
//		"(1) Haute" : {"name" : "Critical"},
//		"(2) Normale" : {"name" : "Minor"},
//		"(3) Faible" : {"name" : "Trivial"},
//	}
//}
