//Version 6.7.18 - 28/05/2025
//https://github.com/salman0ansari/whatsapp-api-nodejs/blob/main/src/api/class/instance.js
//16-11-23  removeImages()
//01-12-23  StatusInstances method response Alive:open - Alive:FirstState, etc
//04-12-23  SetInterval resenpendings / ws on open actualiza su estado al webserver para que haga el update en la tabla
//11-12-23  wss para el scaneo del QR se actualiza de forma automática y al vincular muestra mensaje
//02-01-24  Se arreglo cuando no podia leer una url para descargar la imagen trabaja al webservices mio
//21-05-24  Se paso a la nueva version de baileys 6.72
//24-08-24  Se paso a la nueva version de baileys 6.77
//27-08-24  Recomendacion de no usar el fetchlastversion que lo rompe
//26-10-24  Actualización Baileys --> y refactor
//12-11-24  remove handler en los sends
//17-02-25  Se paso a la nueva version de baileys 6.7.13
//10-03-25  Se paso a la nueva version de baileys 6.7.16
//10-03-25  Se envia a StatusDevice los estados, para que el webservices lo maneje, para envio de email, whatsapp etc.
//18-05-25  se instala la version 6.7.17
//24-05-25  se agrega la compilación y el uso de pm2
//29-01-25  Se agrega sendWithTypingSimulation para simular escritura humana más realista
//29-07-25 20:47  Fixed TypeScript error: Added type guard for text property in sendMessageWTyping
//29-07-25 20:47  Fixed delayedResponse scope issue and sendWithTypingSimulation return value
//29-07-25 21:15  Enhanced disconnect reason handling with comprehensive removeAuthFolder cases
//29-07-25 21:20  Added callSendDeviceStatus('Banned') for banned cases (402, 403)
//29-07-25 21:25  Removed SendListMessage, SendTemplateMessage and sendButtonsMessage functions and endpoints
//29-07-25 21:30  Added rate limiting (10 messages/minute) and dispatch delay (1-3 seconds) to message queue
//29-07-25 21:35  Implemented GUID-based message queue with unique key storage and duplicate prevention
//29-07-25 21:40  Added JSON file persistence for message queue with auto-save and cleanup functionality
//29-07-25 21:45  Enhanced JSON persistence to include rate limiting data (messageSentTimes) for complete state recovery
//11-08-25 AJE: Se agregó comando #forwardTo para reenvío automático de mensajes recibidos
//11-08-25 AJE: Se agregó persistencia de forwardToNumber en instanceClientAuth.json
//11-08-25 AJE: Mejorado formato de reenvío y uso de buffer para media descargable
//15-08-25 22:30  Unified handleDisconnectError and handleBoomError functionality to eliminate code duplication
//20-08-25 22:45  Fixed URL construction to avoid double port issue in file downloads
//21-08-25 23:00  Added #setReadMessages command for automatic message reading functionality
//21-08-25 23:05  Updated #setReadMessages to use English messages and explicit on/off parameters
//21-08-25 23:15  Added /setMessageRead endpoint for marking individual messages as read via API
//21-08-25 23:25  Added persistent GUID tracking to prevent duplicate message sending across restarts
//21-08-25 23:30  Enhanced GUID tracking with 7-day retention and automatic cleanup
//21-08-25 23:35  Fixed sendMessage response to return real WhatsApp message ID instead of timestamp
//11-08-25 AJE: Agregado + al número y "Reenviado desde" en formato de reenvío
//11-08-25 AJE: Corregido reenvío de mensajes de grupo y filtrado de mensajes de protocolo
//04-09-25 23:45  AJE: Enhanced duplicate control by storing GUID + WhatsApp ID pairs for better message tracking
//04-09-25 23:55  AJE: Only consider messages truly sent if they have both GUID and WhatsApp response ID
//04-09-25 23:59  AJE: Added version display at startup and updated to v1.1.0
//05-09-25 00:10  AJE: Changed to internal version variables instead of package.json - v1.2.0
//05-09-25 00:15  AJE: Changed to Baileys-based versioning 6.7.18.100 (subversion increments with each change)

import { Boom } from '@hapi/boom'
import NodeCache from '@cacheable/node-cache'
import makeWASocket, { AnyMessageContent, isJidBroadcast, BinaryInfo, delay, DisconnectReason, downloadAndProcessHistorySyncNotification, encodeWAM, fetchLatestBaileysVersion, getAggregateVotesInPollMessage, getHistoryMsg, isJidNewsletter, makeCacheableSignalKeyStore, proto, useMultiFileAuthState, WAMessageContent, WAMessageKey } from '../src'// ... rest of code ...
import MAIN_LOGGER from '../src/Utils/logger'
import axios from 'axios'
// import bodyParser from 'body-parser'
import express from 'express'
import * as fs from 'fs'
import { writeFile } from 'fs/promises'
// import fetch from 'node-fetch'
import nodemailer from 'nodemailer'
import { MediaType } from '../src/Types'
import { Browsers, downloadContentFromMessage, extensionForMediaMessage, fetchLatestWaWebVersion } from '../src/Utils'
import QRCode from 'qrcode'
import QR from 'qrcode-terminal'
// import { downloadMediaMessage } from '../src'
import { MessageRetryHandler } from "./retryHandler";
import WebSocket from 'ws';
import { promises as fss } from 'fs';
import path from 'path';
import chalk from 'chalk';

// 05-09-25 00:15 - AJE: Internal version control - increment subversion (last number) with each change
// Version format: 6.7.18.XXX where XXX is subversion number starting at 100
const APP_VERSION = '6.7.18.100';
const BUILD_DATE = '05-09-25 00:15';
const VERSION_DESCRIPTION = 'Enhanced GUID + WhatsApp ID duplicate control system';

// WebSocket connections with error handling
let ws: WebSocket | null = null;
let wss: WebSocket | null = null;

try {
    ws = new WebSocket('ws://whatsappinstances.developerteam.com.ar:50000/');
    console.log('✅ WebSocket (ws) connection initialized');
} catch (error) {
    console.error('❌ Failed to initialize WebSocket (ws):', error.message);
    ws = null;
}

try {
    wss = new WebSocket('wss://whatsappsocket.developerteam.com.ar:51000/');
    console.log('✅ WebSocket (wss) connection initialized');
} catch (error) {
    console.error('❌ Failed to initialize WebSocket (wss):', error.message);
    wss = null;
}

// Definición del tipo para los datos de la cola
type QueueItem = {
    guid: string; // Unique identifier for the message
    req: any;
    res: any;
    sock: any;
    handler: any;
	messageType: any; // Tipo de mensaje
    timestamp: number; // When the item was added to queue
};

// Use Map for guid-based queue instead of array
const messageQueue: Map<string, QueueItem> = new Map(); // Cola de mensajes con GUID como clave
let isProcessing = false;

// Rate limiting variables - 10 messages per minute
const MAX_MESSAGES_PER_MINUTE = 10;
const messageSentTimes: number[] = []; // Store timestamps of sent messages

// Queue persistence file path
const QUEUE_FILE_PATH = path.join(__dirname, 'message_queue.json');


const useStore  = true //!process.argv.includes('--no-store')

// external map to store retry counts of messages when decryption/encryption fails
// keep this out of the socket itself, so as to prevent a message decryption/encryption loop across socket restarts
const msgRetryCounterCache = new NodeCache()

// const msgRetryCounterMap: MessageRetryMap = { }
// the store maintains the data of the WA connection in memory
// can be written out to a file & read from it
// const store = makeInMemoryStore({ logger: P().child({ level: 'debug', stream: 'store' }) })
// store.readFromFile('./baileys_store_multi.json')
//AJE
interface InstanceCredentials {
    instanceId: string
    token: string
    urlNotifications: string
    urlRequest:string
    port: number
    emailCustomer:string
	deviceName:string
	senderPhone:string
	chatbot?: boolean
	chatbotUrls?: string[]
	settings?: {
        chatbot?: boolean
        autoReply?: boolean
        multipleEndpoints?: boolean
        fallbackMode?: boolean
        timeout?: number
    }
	lastUpdate?: string
	forwardToNumber?: string
	autoReadMessages?: boolean
}

interface LastStates {
    state: string
    date: string
	dateQrCode: string
}

interface wsData{
	scope: string
	name: string
	value: string
}

interface InstanceClientAuth {
    instanceId: string
    clientName: string
    authenticated: boolean
    chatbot: boolean
    chatbotUrls: string[]
    settings: {
        autoReply: boolean
        multipleEndpoints: boolean
        fallbackMode: boolean
        timeout: number
    }
    lastUpdate: string
}



//const pino = require('pino');
const logger = MAIN_LOGGER.child({})
logger.level = 'trace'


var url = '' /*get from InstanceClientAuth.json */
var urlRequest = '' /*get from InstanceClientAuth.json */
var instanceId = '' /*get from InstanceClientAuth.json */
var senderPhone = '' /*get from InstanceClientAuth.json */
var deviceName  = '' /*get from InstanceClientAuth.json */
var PORT = 0/*get from InstanceClientAuth.json */
var emailCustomer = '' /*get from InstanceClientAuth.json */
var token = '' /*get from InstanceClientAuth.json */
var urlWhatsAppInstance = ''

// Variables para configuración de chatbot
var chatbotConfig: InstanceClientAuth | null = null
var chatbotUrls: string[] = []
var chatbotEnabled = false


// Setup graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Gracefully shutting down...')
    console.log('👋 Goodbye!')
    process.exit(0)
})

process.on('SIGTERM', () => {
    console.log('\n🛑 Received SIGTERM, shutting down...')
    process.exit(0)
})

process.on('exit', () => {
    console.log('👋 Process exiting...')
})

// Helper function to extract text from different message types
function extractMessageText(message: any): string | null {
	if (!message) return null
	
	// Standard text message
	if (message.conversation) {
		return message.conversation
	}
	
	// Extended text message (with links, etc.)
	if (message.extendedTextMessage?.text) {
		return message.extendedTextMessage.text
	}
	
	// Image with caption
	if (message.imageMessage?.caption) {
		return message.imageMessage.caption
	}
	
	// Video with caption
	if (message.videoMessage?.caption) {
		return message.videoMessage.caption
	}
	
	// Document with caption
	if (message.documentMessage?.caption) {
		return message.documentMessage.caption
	}
	
	// Template message (WhatsApp Business)
	if (message.templateMessage?.hydratedTemplate?.hydratedContentText) {
		return message.templateMessage.hydratedTemplate.hydratedContentText
	}
	
	// List response message
	if (message.listResponseMessage?.singleSelectReply?.selectedRowId) {
		return message.listResponseMessage.singleSelectReply.selectedRowId
	}
	
	// Button response message
	if (message.buttonsResponseMessage?.selectedButtonId) {
		return message.buttonsResponseMessage.selectedButtonId
	}
	
	// Interactive response message
	if (message.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson) {
		return message.interactiveResponseMessage.nativeFlowResponseMessage.paramsJson
	}
	
	return null
}

var urlConnectServices = 'https://connectservices.developerteam.com.ar/resendPendings'
var urlDeviceStatus = 'https://connectservices.developerteam.com.ar/StatusDevice'
var urlContacts = 'https://connectservices.developerteam.com.ar/Contacts'
var urlTrackingStatus = 'https://connectservices.developerteam.com.ar/TrackingStatus'

var serverInit = 0

// var lastState = ''
var retryConnect = 0
var groupSubject = ''
let connectionState
let connectionStatus
var msg1 = ''
var retriesConnecting = 0
var retriesClose = 0
var retriesQrcode = 0
var retriesOpen = 0

var lastIdReceived ='';
var resendPendingsAction = false;
// 2025-08-11 - AJE: Variable para almacenar número de reenvío automático
var forwardToNumber: string = '';
// 21-08-25 - AJE: Variable para habilitar auto-lectura de mensajes
var autoReadMessages: boolean = false;
// 2025-08-11 - AJE: Path del archivo de credenciales para guardado
var credentialsFilePath: string = '';

// 21-08-25 23:25 - AJE: Map para almacenar GUIDs ya enviados con timestamp y archivo de persistencia
// 04-09-25 23:45 - AJE: Enhanced to store GUID + WhatsApp ID pairs for better duplicate control
interface SentMessageInfo {
    timestamp: number;
    whatsappId?: string; // ID real que devuelve WhatsApp
}

var sentGuids: Map<string, SentMessageInfo> = new Map();
const sentGuidsFilePath = path.join(__dirname, 'sentGuids.json');
const GUID_RETENTION_DAYS = 7;

// Global socket variable for access in API endpoints
var globalSock: any = null;

const stateFilePath = path.join(__dirname, 'connectionState.json');
// Variables iniciales (cargadas desde el archivo)
const currentDate = getCurrentDate();
let { emailSentForConnecting, emailSentForOpen, lastSentDate, lastSentQrDate } = readStateFromFile();
let prevConnectionStatus = null;

// el almacenamiento mantiene los datos de la conexión de WA en memoria
// puede escribirse en un archivo y leerse desde él

const storeFilePath = './baileys_store_multi.json'; // Ruta de archivo configurable
// const store = useStore ? makeInMemoryStore({ logger }) : undefined;

// try {
//     store?.readFromFile(storeFilePath);
//     console.log(`Almacenamiento cargado con éxito desde ${storeFilePath}`);
// } catch (error) {
//     console.error(`Error al leer el almacenamiento desde ${storeFilePath}:`, error);
// }


const saveStore = async () => {
    // if (!store) {
    //     console.warn("Store is undefined. Skipping save.");
    //     return;
    // }

    // try {
    //     await store.writeToFile(storeFilePath); // Ensure it's awaited if it's async
    //     console.log(`✅ Almacenamiento guardado con éxito en ${storeFilePath}`);
    // } catch (error) {
    //     console.error(`❌ Error al guardar el almacenamiento en ${storeFilePath}:`, error);
    // }
};

const gracefulShutdown = async (reason: string) => {
    console.log(`🛑 Aplicación cerrándose por: ${reason}`);
    
    await saveStore(); // Ensure storage is saved before exiting
    handleConnectionStatusChange('close'); // Handle disconnection cleanly

    process.exit(0); // Exit successfully
};

// Catch SIGINT (Ctrl+C)
process.on('SIGINT', async () => {
    await gracefulShutdown('SIGINT (Ctrl+C)');
});

// Catch process termination
process.on('exit', async () => {
    await gracefulShutdown('exit event');
});


const clearStore = () => {
    try {
        // Sobrescribe el contenido del archivo con un objeto vacío
        const emptyStore = {}; // Aquí puedes ajustar al formato inicial esperado
        require('fs').writeFileSync(storeFilePath, JSON.stringify(emptyStore, null, 2));
        console.log(`Almacenamiento vaciado con éxito en ${storeFilePath}`);
    } catch (error) {
        console.error(`Error al vaciar el almacenamiento en ${storeFilePath}:`, error);
    }
};

// guardar cada 10 segundos
const getContacts = () => {
    try {
        // Verificar si 'store' y 'store.contacts' están definidos
        // if (!store || !store.contacts) {
        //     console.error("store o store.contacts no están definidos correctamente.");
        //     return null;
        // }

        // Transformar el objeto 'contacts' en un array
        // const formattedData = {
        //     contacts: Object.values(store.contacts).map((contact: any) => ({
        //         id: contact.id || "", // Asegurarse de que 'id' esté definido
        //         lid: contact.lid || "", // Asegurarse de que 'lid' esté definido
        //         name: contact.name || "",
        //         number: contact.id?.includes("@") ? contact.id.split("@")[0] : "", // Extraer número de 'id'
        //         imgurl: contact.imgUrl || "", // Imágen URL por defecto
        //         notify: contact.notify || "", // Notificación por defecto
        //         verifiedname: contact.verifiedName || "", // Nombre verificado por defecto
        //         status: contact.status || "" // Estado por defecto
        //     })),
        //     InstnceId: instanceId // Establecer 'InstnceId' como "value"
        // };


        // console.log("Formatted Data:", JSON.stringify(formattedData, null, 2));
        // return formattedData; // O puedes devolver un JSON stringificado: JSON.stringify(formattedData, null, 2);

    } catch (error) {
        console.error("Error en la generación de JSON:", error);
        return null; // Retorna un valor seguro en caso de error
    }
};


const getChats = () => {
    // try {
	// 	console.log(JSON.stringify(store?.chats, null, 2));
	// 	return fusionJson(JSON.stringify(store?.chats, null, 2))
		
    // } catch (error) {
    // }
};

// Get chats with no human interaction in the last hour
const getInactiveChats = (hoursSinceLastActivity: number = 1) => {
    try {
        if (!globalSock) {
            return { error: 'WhatsApp socket not available' };
        }

        const oneHourAgo = Date.now() - (hoursSinceLastActivity * 60 * 60 * 1000);
        const inactiveChats: any[] = [];

        // Get all chats from the socket - we need to access the chats from the socket store
        // The actual chat data is stored differently in Baileys v6
        console.log('Available socket properties:', Object.keys(globalSock || {}));
        
        // For Baileys v6, we might need to access chats differently
        // Let's check if there's a store or chats property
        const chatStore = globalSock.store?.chats || globalSock.chats || {};
        const allChats = Object.values(chatStore);
        
        console.log(`Found ${allChats.length} chats in store`);
        
        for (const chat of allChats) {
            const chatData = chat as any;
            
            // Skip if chat doesn't have required data
            if (!chatData.id) continue;
            
            // Get the last message received timestamp or conversation timestamp
            const lastMessageTime = chatData.lastMessageRecvTimestamp || 
                                  	chatData.conversationTimestamp || 
                                  	chatData.lastMsgTimestamp || 0;
            
            // Convert to milliseconds if it's in seconds
            const lastMessageTimeMs = lastMessageTime > 1000000000000 ? 
                                     lastMessageTime : lastMessageTime * 1000;
            
            // Check if the last human interaction was more than the specified hours ago
            if (lastMessageTimeMs < oneHourAgo) {
                inactiveChats.push({
                    id: chatData.id,
                    name: chatData.name || chatData.pushName || 'Unknown',
                    lastActivity: lastMessageTimeMs > 0 ? new Date(lastMessageTimeMs).toISOString() : 'Never',
                    hoursSinceLastActivity: lastMessageTimeMs > 0 ? Math.round((Date.now() - lastMessageTimeMs) / (1000 * 60 * 60)) : 'N/A',
                    unreadCount: chatData.unreadCount || 0,
                    archived: chatData.archived || false,
                    muted: !!chatData.muteEndTime,
                    isGroup: chatData.id.includes('@g.us')
                });
            }
        }

        // Sort by last activity (oldest first)
        inactiveChats.sort((a, b) => {
            if (a.lastActivity === 'Never') return 1;
            if (b.lastActivity === 'Never') return -1;
            return new Date(a.lastActivity).getTime() - new Date(b.lastActivity).getTime();
        });

        return {
            total: inactiveChats.length,
            hoursSinceLastActivity,
            chats: inactiveChats,
            debug: {
                totalChatsInStore: allChats.length,
                socketAvailable: !!globalSock,
                storeAvailable: !!(globalSock?.store || globalSock?.chats)
            }
        };
        
    } catch (error) {
        console.error('Error getting inactive chats:', error);
        return { error: error.message, stack: error.stack };
    }
};

const getMessages = () => {
    // try {
	// 	console.log(JSON.stringify(store?.messages, null, 2));
	// 	return fusionJson(JSON.stringify(store?.messages, null, 2))
		
    // } catch (error) {
    // }
};

setInterval(saveStore, 10_000);

const handler = new MessageRetryHandler();
const timeToReset = 3600 * 1000 //una hora para que se reinicie.... lo devería levantar el WebServer Instance o el watchDog..
const timeToResendPendings = 90 * 1000 // cada 3 minutos que haga el ResendPendings

// const { state, saveState } = useSingleFileAuthState('./auth_info_multi.json')

// start a connection
const init = async() => {
	// 05-09-25 00:10 - AJE: Display version and build info at startup using internal variables
	console.log(chalk.bgBlueBright.white.bold(`🚀 WhatsApp Instance API v${APP_VERSION} - Starting...`));
	console.log(chalk.cyan(`📅 Build Date: ${BUILD_DATE}`));
	console.log(chalk.green(`🔧 ${VERSION_DESCRIPTION}`));
	console.log(chalk.gray('━'.repeat(70)));
	
	// Load existing queue and sent GUIDs on startup
	await loadQueueFromFile();
	await loadSentGuidsFromFile();
	
	const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info')
	// fetch latest version of WA Web
	//
	// const path = require('path');
	// const authPath = path.join(process.cwd(), 'InstanceClientAuth.json');

	const authPath = path.join(__dirname, '..', 'InstanceClientAuth.json');
	// 2025-08-11 - AJE: Guardar el path para uso posterior
	credentialsFilePath = authPath;

	const credentialInfo = loadInstanceCredential(authPath)
	console.log('after instanceCredential instanceId', credentialInfo.instanceId)
	// fetch latest version of WA Web
	// const { version, isLatest } = await fetchLatestBaileysVersion()
	// const { version, isLatest } = await fetchLatestBaileysVersion()
	// const version = [2, 3000, 1015901307]; //recomendacion usar asi sino el fetch lo rompe
	const { version, isLatest } = await fetchLatestWaWebVersion({
		headers: {
			'User-Agent': 'Mozilla/5.0'
		}
	})
	console.log(`using WA v${version.join('.')}, isLatest: ${isLatest}`)

	function resetInstance() {
		const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}` //no modifico por ahora nada aqui
		console.log('Bye Bye')
		sendWhatsAppInstance(JSON.parse(newJson))
	}

	setTimeout(resetInstance, timeToReset);
	
	
	const sock = makeWASocket({
		// version,//:  [2, 3000, 1022032575],
		version:  version, //[2, 3000, 1023223821],
		// logger,
		printQRInTerminal: false,
		auth: {
			creds: state.creds,
			/** caching makes the store faster to send/recv messages */
			keys: makeCacheableSignalKeyStore(state.keys, logger),
		},
		// retryRequestDelayMs: 1000, //13-11-24
		// msgRetryCounterMap,
		generateHighQualityLinkPreview: true,
		// browser: ['DeveloperTeam', '', '5.1'],
		browser: ["Windows", "Chrome", "126.0.6478.126"],
		// browser: Browsers.appropriate('whatsapp api'),

		markOnlineOnConnect:false,
		syncFullHistory:false,
		msgRetryCounterCache,
		// ignore all broadcast messages -- to receive the same
		// comment the line below out
		shouldIgnoreJid: jid => isJidBroadcast(jid),
		// implement to handle retries
		getMessage,
	}
)
	
	// Assign to global variable for API access
	globalSock = sock;
	

	// store?.bind(sock.ev)

	sock.ev.process(
		async (events) => {

			console.log("Eventos recibidos:", events);

			// sock.ev.on('chats.set', item => chatSet(item))
			// sock.ev.on('messages.set', item => messageSet(item))
			// sock.ev.on('contacts.set', item => contactsSet(item))


			// received a new message
			if(events['messages.upsert']) {
				const upsert = events['messages.upsert']
				await messagesUpsert(upsert,sock)
			}
			// sock.ev.on('presence.update', m => presenceUpdate(m))
			// sock.ev.on('chats.update', m => chatsUpdate(m))
			// sock.ev.on('contacts.upsert', m => contactsUpsert(m))

			// credentials updated -- save them
			if (events['error']) {
				console.log('recv error event', events['error'])
			}

			if (events['creds.update']) {
				await saveCreds()
			}

			if (events.call) {
				console.log('recv call event', events.call)
			}

			// chat history received
			if (events['chats.set']) {
				const { chats, isLatest } = events['chats.set']
				console.log(`recv ${chats.length} chats (is latest: ${isLatest})`)
			}

			// message history received
			if (events['messages.set']) {
				const { messages, isLatest } = events['messages.set']
				console.log(`recv ${messages.length} messages (is latest: ${isLatest})`)
			}

			if (events['contacts.set']) {
				const { contacts, isLatest } = events['contacts.set'];
				console.log(`recv ${contacts.length} contacts (is latest: ${isLatest})`);
				
				// Mostrar todos los contactos en la consola
				console.log('Contacts:', contacts);
				
				// Mostrar cada contacto individualmente
				contacts.forEach((contact, index) => {
					console.log(`Contact ${index + 1}:`, contact);
				});
			}

			contactsUpdate(events);
			

			if (events['contacts.update']) {
				const contacts = events['contacts.update']; // Aquí directamente asignamos el array
			
				console.log(`📌 contacts.update ${contacts.length} contacts.length.`);
			
				// Mostrar todos los contactos en la consola
				console.log('🔍 Lista de contactos:', contacts);
			
				// Mostrar cada contacto individualmente
				contacts.forEach((contact, index) => {
					console.log(`🔹 Contacto ${index + 1}:`);
					console.log(`  - ID: ${contact.id}`);
					console.log(`  - Nombre: ${contact.name || 'Desconocido'}`);
					console.log(`  - Img URL: ${contact.imgUrl || 'No disponible'}`);
				});
			}
			
			
			

			// messages updated like status delivered, message deleted etc.
			if (events['messages.update']) {
				// console.log(events['messages.update'])
				const update = events['messages.update']
				await messageUpdate(update)
			}

			if (events['message-receipt.update']) {
				// console.log(events['message-receipt.update'])
				const receipt = events['message-receipt.update']
				await messageReceiptUpdate(receipt)
			}

			if (events['messages.reaction']) {
				console.log(events['messages.reaction'])
			}

			if (events['presence.update']) {
				console.log(events['presence.update'])

				
			}

			if (events['chats.update']) {
				// console.log(events['chats.update'])
				const chats  = events['chats.update'];
				await chatsUpdate(chats)
			}

			if (events['chats.delete']) {
				console.log('chats deleted ', events['chats.delete'])
			}

			//#region connectionUpdate
			if (events['connection.update']) {
				const update = events['connection.update'];
				handleConnectionUpdate(update,instanceId);
			}
	
			// listen for when the auth credentials is updated
			// credentials updated -- save them
			if(events['creds.update']) {
				await saveCreds()
			}

			if(events.call) {
				console.log('recv call event', events.call)
			}
		})
	if (serverInit === 0) {
		await initWebServer(sock,handler)
        await processFailedRequests();
	}
	return sock
}

async function getMessage(key: WAMessageKey): Promise<WAMessageContent | undefined> {
	// if(store) {
	// 	const msg = await store.loadMessage(key.remoteJid!, key.id!)
	// 	return msg?.message || undefined
	// }

	// only if store is present
	return proto.Message.fromObject({})
}

function handleConnectionState(connection: string, update: any) {
    console.log(chalk.yellow('Handle Connection status=') + connection);

    connectionState  = connection;
    connectionStatus = update.connection;

    handleConnectionStatusChange(connectionStatus);
}

function handleQR(qr: string) {
    console.log('HandleQR retriesQrcode=' + retriesQrcode);
    generateQR(qr);
    QR?.generate(qr, { small: true });

	if(lastSentQrDate !== currentDate){
		// sendEmail('QrCode');
		callSendDeviceStatus('QrCode');
	}

    emailSentForConnecting 	= true;
    emailSentForOpen 		= false; // Reiniciar estado para "open"
    lastSentDate 			= currentDate; // Actualizar la fecha del último envío
    lastSentQrDate 			= currentDate;
    writeStateToFile({ emailSentForConnecting, emailSentForOpen, lastSentDate, lastSentQrDate });
    removeSession();
    // clearStore();
}

function handleConnectionUpdate(update: any, instanceId: string) {
    // const { connection, lastDisconnect } = update;
	const { connection, lastDisconnect, qr } = update;
    const error = lastDisconnect?.error as Boom | Error | undefined;
	
	connectionState = connection;

    console.log(chalk.green(`Handle Connection update:`), update);
    console.log(chalk.red(`Handle Connection update error:`), error);

	
	// Si hay QR, manejarlo
	if (qr) {
		handleQR(qr);
	}
	
	// Manejo de la conexión
	if (connection) {
		handleConnectionState(connection, update);
	}
	
	// console.log(chalk.bgBlueBright('connection update'), update);
	
    if (connection === 'close') {
        // Reconectar si no es un cierre por logout
        const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
            console.log('Reconectando debido a cierre no autorizado...');
            init();
            return;
        }

        // Manejar errores específicos en caso de cierre
        if (error) {
            console.error(`Connection closed due to error: ${error.message}`);
            if (error instanceof Boom) {
                const { statusCode, payload } = error.output;
                console.error('Boom Error Details:', {
                    statusCode,
                    payload,
                });
                // Manejo por código de estado
                handleBoomError(statusCode, payload, instanceId, error.message);
            } else {
                console.error(`Non-Boom error occurred: ${error.stack}`);
            }
        } else {
            console.log('Connection closed without an error.');
        }
    } else {
        console.log(chalk.bgMagenta(`Connection status=${connection}`));

		console.log(chalk.red('entre en el else del qr....'));
		const newJson = `{"InstanceId":${instanceId},"Action":"${lastDisconnect?.error?.message}"}`;
		sendWhatsAppInstance(JSON.parse(newJson));
	
		if (lastDisconnect?.error?.message === 'Connection was lost' || lastDisconnect?.error?.message.includes('(conflict)')) {
			console.log('Connection was lost or replaced');
			const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}`;
			sendWhatsAppInstance(JSON.parse(newJson));
		}
    }
}

/**
 * Manejo unificado de errores de desconexión basado en código de estado y mensajes de error.
 * 15-08-25 22:30  Unified handleDisconnectError and handleBoomError functionality
 * 29-07-25 21:15  Enhanced with comprehensive disconnect reason handling
 */
function handleBoomError(statusCode: number, payload: any, instanceId: string, errorMessage?: string) {
	console.log(chalk.yellow('handleBoom:'+statusCode))
	
	// Handle string-based error messages first (from handleDisconnectError)
	if (errorMessage) {
		if (errorMessage === 'Stream Errored (conflict)' || errorMessage === 'Connection Failure') {
			console.log('connection replaced');
			removeSession();
			const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}`;
			sendWhatsAppInstance(JSON.parse(newJson));
			return;
		}
		
		if (errorMessage === 'Stream Errored' || errorMessage === 'Stream Errored (unknown)') {
			console.log('closed by=' + statusCode);
			const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}`;
			sendWhatsAppInstance(JSON.parse(newJson));
			return;
		}
	}
    switch (statusCode) {
        case 400: // genericOut
            console.log('Generic disconnect - restarting without removing auth');
            restartInstance(instanceId);
            break;
        case 401: // loggedOut - Disconnected from another device
            console.log('Unauthorized: Verifica las credenciales de sesión.');
			// sendEmail('Close');
			callSendDeviceStatus('Close');
			emailSentForOpen = false;
			emailSentForConnecting = false; // Reiniciar estado para "connecting"
			lastSentDate   = ''; // forzar el envio
			lastSentQrDate = '';
			writeStateToFile({ emailSentForConnecting, emailSentForOpen, lastSentDate, lastSentQrDate });
			
            removeAuthFolder();
            removeSession();
            restartInstance(instanceId);
            break;
        case 402: // bannedTimetamp - Status code 402 has a ban timestamp
            console.log('Account temporarily banned with timestamp - removing auth folder');
            callSendDeviceStatus('Banned');
            removeAuthFolder();
            removeSession();
            restartInstance(instanceId);
            break;
        case 403: // bannedTemporary - Account banned, main device was disconnected
            console.log('Account temporarily banned - removing auth folder');
            callSendDeviceStatus('Banned');
            removeAuthFolder();
            removeSession();
            restartInstance(instanceId);
            break;
        case 405: // clientOutdated - Client outdated
            console.log('Client outdated - removing auth folder for fresh start');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 406: // unknownLogout - Disconnected for unknown reason
            console.log('Unknown logout reason - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 408: // timedOut/connectionLost - Connection timed out or lost
            console.log('Timeout: Reintentando conexión...');
            restartInstance(instanceId);
            break;
        case 409: // dadUserAgent - Client user agent was rejected
            console.log('User agent rejected - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 411: // multideviceMismatch - Multi-device mismatch
            console.log('Multi-device mismatch - removing auth folder for fresh scan');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 413: // CATExpired - Cryptographic authentication token expired
            console.log('Authentication token expired - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 414: // CATInvalid - Cryptographic authentication token is invalid
            console.log('Authentication token invalid - removing auth folder');
            removeAuthFolder();
            removeSession();
            restartInstance(instanceId);
            break;
        case 415: // notFound
            console.log('Resource not found - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 428: // connectionClosed - Connection closed
            console.log('Connection closed - restarting without removing auth');
            restartInstance(instanceId);
            break;
        case 440: // connectionReplaced - Connection replaced, new session opened
            console.log('Connection replaced by new session - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 500: // badSession - Session file corrupted
            console.log('Error interno del servidor/Bad session - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 501: // experimental
            console.log('Experimental feature error - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        case 503: // serviceUnavailable
            console.log('Service unavailable - restarting without removing auth');
            restartInstance(instanceId);
            break;
        case 515: // restartRequired
            console.log('Restart required - removing auth folder');
            // removeAuthFolder();
            // removeSession();
            restartInstance(instanceId);
            break;
        default:
            console.log(`Error no manejado (código ${statusCode}):`, payload?.message);
            break;
    }
}


function restartInstance(instanceId: string) {
    const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}`;
    sendWhatsAppInstance(JSON.parse(newJson));
    console.log(`Reiniciando instancia con ID: ${instanceId}`);
}


async function wsConnect() {
    let reconnectInterval = 5000; // Intervalo de reconexión en milisegundos
    let isReconnecting = false;

    function handleReconnect(type) {
        if (!isReconnecting) {
            isReconnecting = true;
            console.log(`Disconnected from wsConnect -> ${type}. Reconnecting in ${reconnectInterval}ms...`);
            setTimeout(() => {
                try {
                    wsConnect();
                } catch (error) {
                    console.error('❌ Error during WebSocket reconnection:', error.message);
                }
                isReconnecting = false;
            }, reconnectInterval);
        }
    }

    // WebSocket Server (wss)
    if (wss) {
        wss.on('error', (error) => {
            console.error('❌ WebSocket (wss) error:', error.message);
            // Don't crash the app on WebSocket errors
        });

        wss.on('open', () => {
            console.log('WSS connected');
            wss.send(Date.now());
            wss.send('watch hostvalue QR ');
        });

        wss.on('close', () => handleReconnect('wss'));
    } else {
        console.log('WSS disabled for testing');
    }

    // WebSocket (ws)
    if (ws) {
        ws.on('error', (error) => {
            console.error('❌ WebSocket (ws) error:', error.message);
            // Don't crash the app on WebSocket errors
        });

        ws.on('open', () => {
            console.log('WS connected');
            ws.send(Date.now());
            ws.send('watch hostvalue Status ');
            ws.send('watch hostvalue Request ');
            ws.send('watch hostvalue Action ');
            ws.send('set hostvalue Status "' + instanceId + '|' + readLastState() + '"');
        });

        ws.on('close', () => handleReconnect('ws'));
    } else {
        console.log('WS disabled for testing');
    }

    if (ws) {
        ws.on('message', (data) => {
            const dataReceived = JSON.parse(data.toString()) as wsData;
            const arrayRecibido = dataReceived.value.split('|');

            if (dataReceived.name === 'request' && dataReceived.value === instanceId) {
                sendMessageWs('set hostvalue Status "' + instanceId + '|' + readLastState() + '"','ws');
            }

            if (dataReceived.name === 'action') {
                const [wInstance, wAction, wValue] = arrayRecibido;

                if (wInstance === instanceId) {
                    console.log(`Action: ${wAction}, Value: ${wValue}`);
                    if (wAction === 'resendPendings') {
                        resendPendingsAction = wValue === 'true';
                    }
                }
            }
        });
    }
}

function sendMessageWs(message: string, target: 'ws' | 'wss') {
    let socket = target === 'wss' ? wss : ws;

    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(message);
        console.log(`Message sent to ${target}`);
    } else if (!socket) {
        console.log(`WebSocket ${target} is disabled for testing`);
    } else {
        console.log(`WebSocket Target -> (${target}) is not ready. State: ${socket.readyState}`);
    }
}



//----------
async function initWebServer(sock,handler) {
	serverInit = 1
	var urlTempRequest = urlRequest//'51.81.64.250'//por ahora a mano await publicIp.v4()
	// urlRequest = 'http://' + urlTempRequest
    urlRequest = urlTempRequest
	console.log(urlRequest)
	//=> '46.5.21.123'ws async

	// console.log(await publicIp.v6());
	//=> 'fe80::200:f8ff:fe21:67cf'

	const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

	console.log('⏳ Esperando 5 segundos antes de iniciar...');
	await delay(15000); // espera 5 segundos

	console.log('🚀 Inicio del proceso...');
	// tu código principal acá

	try {
		wsConnect();
	} catch (error) {
		console.error('❌ Error starting WebSocket connections:', error.message);
		console.log('⚠️  Continuing without WebSocket connections...');
	}
	

	// PORT = 8001
	const app = express()
	app.use(express.json())


	// app.use(bodyParser.json())

	app.use(express.json({ limit: '50mb' }))
	app.use(express.urlencoded({ extended: true }))
	// console.log('parser=',)

	app.post('/connectToWhatsApp', async(request, response) => {
		console.log(request.body) // your JSON
		// this.connectToWhatsApp(response)

	})
	app.post('/reconnect', async(request, response) => {
		console.log(request.body) // your JSON
		init()
		response.send('{"status":"' + connectionState + '"}')

	})
	app.post('/closeConnection', async(request, response) => {
		console.log('CLOSE REQUESTED=' + request.body) // your JSON
		// conn.close()
		response.send('{"status":"closing connection"}')

	})
	app.post('/logoutConnection', async(request, response) => {
		console.log(request.body) // your JSON
		// conn.logout()
		response.send('{"status":"loggin out"}')

	})
	app.get('/connectionStatus', async(request, response) => {
		console.log(request.body) // your JSON
		response.send('{"status":"' + connectionStatus + '"}')
	})

	app.post('/sendMessage', async(request, response) => {
		console.log('sendMessage api=', request.body) // your JSON
		// To this:
		const messageType: 'text' | 'image' = 'text';
		if(checkJson(request.body)==false){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error json invalid"}`))
			return
		}
		if(connectionStatus !='open'){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error Need to scanQrCode"}`))
			return
		} else {
			
			await enqueueMessage({ req:request, res:response, sock, handler,messageType});
			// sendTextMessage(request, response, sock, handler)
	}
	})

	// send a buttons message with image header!
	app.post('/sendFile', async(request, response) => {
		// To this:
		const messageType: 'text' | 'image' = 'image';
		console.log(request.body) // your 
		if(checkJson(request.body)==false){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error json invalid"}`))
			return
		}
		if(connectionStatus !='open'){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error Need to scanQrCode"}`))
			return
		}else{
			await enqueueMessage({req:request, res:response, sock, handler, messageType});
			// sendFile(request, response, sock,handler)
		}
		
		//response.send(request.body);    // echo the result back
	})

	app.post('/deleteMessage', async(request, response) => {
		console.log('deleteMessage api=', request.body.phone) // your JSON
		// To this:
		if(checkJson(request.body)==false){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error json invalid"}`))
			return
		}
		if(connectionStatus !='open'){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error Need to scanQrCode"}`))
			return
		} else {
			
			deleteMessage({ req:request, res:response, sock});
			// sendTextMessage(request, response, sock, handler)
	}
	})


	app.post('/deleteResendMessage', async(request, response) => {
		console.log('deleteResendMessage api=', request.body.phone) // your JSON
		// To this:
		if(checkJson(request.body)==false){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error json invalid"}`))
			return
		}
		if(connectionStatus !='open'){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error Need to scanQrCode"}`))
			return
		} else {
			const messageType: 'text' | 'image' = 'image';
			deleteResendMessage({ req:request, res:response, sock, handler, messageType});
			// sendTextMessage(request, response, sock, handler)
	}
	})

	app.get('/getMessage', async(request, response) => {
		console.log('getMessage api=', request.body.phone) // your JSON
		// To this:
		response.send(getMessages());
		if(checkJson(request.body)==false){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error json invalid"}`))
			return
		}
		if(connectionStatus !='open'){
			response.send(JSON.parse(`{"sent":false,"message":"Sent to","phone":"${request.body.phone}","status":"Error Need to scanQrCode"}`))
			return
		} else {
			// getMessageTest({ req:request, res:response, sock, handler});
			// sendTextMessage(request, response, sock, handler)
	}
	})


	app.post('/sendLocationMessage', async(request, response) => {
		console.log(request.body) // your JSON
		// this.sendLocationMessage(request, response)
		//response.send(request.body);    // echo the result back
	})

	app.post('/getStatusOnWhatsApp', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.getStatusOnWhatsApp(request, response)
	})

	app.post('/loadAllMessages', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.loadAllMessages(request, response)
		// const authInfo = conn.loadAuthInfo ('./auth_info.json');

		// Conversation.extractChats(authInfo,'ChatsReceived.csv',`${request.body.phone}@s.whatsapp.net`)

	})
	app.post('/loadAllMessagesAfter', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.loadAllMessagesAfter(request, response)
		// const authInfo = conn.loadAuthInfo ('./auth_info.json');

		// Conversation.extractChats(authInfo,'ChatsReceived.csv',`${request.body.phone}@s.whatsapp.net`)
	})
	app.post('/getStatus', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.getStatus(request, response)
		// const authInfo = conn.loadAuthInfo ('./auth_info.json');
		// Conversation.extractChats(authInfo,'ChatsReceived.csv',`${request.body.phone}@s.whatsapp.net`)

	})
	
	
	app.post('/isOnWhatsApp', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.getStatus(request, response)
		// const authInfo = conn.loadAuthInfo ('./auth_info.json');
		// Conversation.extractChats(authInfo,'ChatsReceived.csv',`${request.body.phone}@s.whatsapp.net`)
		const [result] = await sock.onWhatsApp(`${request.body.phone}@s.whatsapp.net`)
		const exist = result.exists
		response.send(JSON.parse(`{"phone":"${request.body.phone}","exist":"${exist}"}`))
		//no funciona
	})
	

	app.post('/getProfilePicture', async(request, response) => {
		//response.send(request.body);    // echo the result back
		// this.getProfilePicture(request, response)
		// const authInfo = conn.loadAuthInfo ('./auth_info.json');

		// Conversation.extractChats(authInfo,'ChatsReceived.csv',`${request.body.phone}@s.whatsapp.net`)

	})

	app.post('/setStatus', async(request, response) => {
		console.log(request.body) // your JSON
		// this.setStatus(request, response)
		//response.send(request.body);    // echo the result back
	})

	// 21-08-25 23:15  Endpoint para marcar mensajes como leídos
	app.post('/setMessageRead', async(request, response) => {
		console.log('setMessageRead api=', request.body)
		
		try {
			// Validar que tenga los campos requeridos
			if (!request.body.phone || !request.body.messageId) {
				response.status(400).json({
					success: false,
					error: "Missing required fields: phone and messageId"
				})
				return
			}

			// Validar conexión
			if (connectionStatus !== 'open') {
				response.status(503).json({
					success: false,
					error: "WhatsApp connection not available",
					status: connectionStatus
				})
				return
			}

			const phone = request.body.phone.includes('@') ? request.body.phone : `${request.body.phone}@s.whatsapp.net`
			const messageKey = {
				remoteJid: phone,
				id: request.body.messageId,
				fromMe: request.body.fromMe || false
			}

			// Marcar mensaje como leído
			await sock!.readMessages([messageKey])
			
			console.log(`✅ Message marked as read: ${request.body.messageId} from ${phone}`)
			
			response.json({
				success: true,
				message: "Message marked as read",
				phone: phone,
				messageId: request.body.messageId
			})

		} catch (error) {
			console.error('❌ Error marking message as read:', error)
			response.status(500).json({
				success: false,
				error: "Failed to mark message as read",
				details: error.message
			})
		}
	})

	app.post('/setChatRead', async(request, response) => {
		console.log(request.body) // your JSON
		// this.setChatRead(request, response)
		// .then('Sent successfully!')
		//response.send(request.body);    // echo the result back
	})
	app.get('/loadChats', async(request, response) => {
		console.log(request.body) // your JSON
		response.send(getChats())
		// this.loadChats(request, response)
		// .then('Sent successfully!')
		//response.send(request.body);    // echo the result back
	})
	
	app.get('/getInactiveChats', async(request, response) => {
		const hours = request.query.hours ? parseFloat(request.query.hours as string) : 1;
		console.log(`Getting chats with no human interaction in the last ${hours} hour(s)`);
		const result = getInactiveChats(hours);
		response.json(result);
	})
	
	app.post('/sendMessageNew', async(request, response) => {
		console.log('sendMessageNew request:', request.body);
		await sendMessageNew(request, response, globalSock, handler);
	})
	app.post('/sendMessageBroadcast', async(request, response) => {
		console.log(request.body) // your JSON
		// this.sendMessageBroadcast(request, response)
		// .then('Sent successfully!')
		// .catch(err => {
		//     console.log("unexpected error: " + err)
		//    response.send("Unexpected "+err)
		//     fs.existsSync('./auth_info.json') && conn.loadAuthInfo ('./auth_info.json')
		// }) // catch any errors
		//response.send(request.body);    // echo the result back
	})
	app.get('/DownloadFile', async(request, response) => {
		console.log(request.body) // your JSON
		downloadFileRequest(request, response)

	})
	app.get('/getContacts', async(request, response) => {
		console.log(request.body) // your JSON
		response.send(getContacts());


		// this.getContacts(request, response)

	})
	app.get('/sendEmail', async(request, response) => {
		console.log(request.body) // your JSON
		// this.sendEmail('fromApi')
		response.send('request received')

	})

	app.get('/StatusInstance', async(request, response) => {
		console.log('StatusInstance InstanceID='+instanceId) // your JSON
		console.log('StatusInstance resendPendingsAction='+resendPendingsAction) // your JSON
		response.send('Alive:'+readLastState())
	})
	app.get('/StateInstance', async(request, response) => {
		console.log('StatusInstance InstanceID='+instanceId) // your JSON
		response.send(readLastState())
	})

	app.get('/TerminateInstance', async(request, response) => {
		console.log(request.body) // your JSON
		response.send('Terminated')
		process.exit(0);
	})

	app.get('/GetQrCode', async (request, response) => {
		try {
			// Extraer instanceId desde los parámetros de la solicitud
			// Llamar a la función getQRCode
			await getQRCode(instanceId);
	
			// Enviar respuesta de éxito
			response.send('QR Code procesado exitosamente');
		} catch (error) {
			console.error('Error procesando /GetQrCode:', error.message);
			response.status(500).send('Ocurrió un error al procesar el QR Code');
		}
	});

	app.listen(PORT, () => {
		console.log(`⚡️[server]: Server is running at ${urlRequest}:${PORT}`)
		console.log('Date=' + getDate())
	})
	removeImages()   // cuando inicio que borre todos los archivos de 1 dia de viejos
	// if(connectionStatus==='open'){
	// 	resendPendings() // le pido al server principal que se fije y reenvie todos los que pudieren haber pendientes
	// }
	
}

//------------------------------------------------------------------------------------------------------------------------

function checkJson(body) {
    // Verifica si el cuerpo es un objeto y está bien formado
    if (!body || typeof body !== 'object') {
        return false;
    }

    return true; // Si todas las verificaciones pasan, devuelve true
}

const generateQR = async text => {
	try {
		var qrCodeBase64 = await QRCode.toDataURL(text)

		sendMessageWs('set hostvalue QR "' + instanceId + '|' + qrCodeBase64 + '"','wss') //reporto el estado actual al webserver para que se actulice el estado

		const filePath = path.join(__dirname, '..', 'Media/');
		// const filePath = './Media/'
		const file = `qrCode_${instanceId}.png`
		const fileUrl = url + file
		const newJson = `{"event":[{"name":"qrCode","instanceId":"${instanceId}","value":"${file}","status":"to scan"}]}`
		// var image = 'data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAA..kJggg==';
		var data = qrCodeBase64.replace(/^data:image\/\w+;base64,/, '')

		fs.writeFile(filePath + file, data, { encoding: 'base64' }, (err) => {
			//Finished
		})

		if(retriesQrcode==0){
		
		}
		retriesQrcode += 1 //para enviar un solo email
		if(retriesQrcode==50){
			const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}` //no modifico por ahora nada aqui
			sendWhatsAppInstance(JSON.parse(newJson))
		}
		
		// sendAsync(JSON.parse(newJson)) por ahora no lo quiero enviar al server, que cuando escaneen ya lo pide solo y lo trae desde aquí.

	} catch(err) {
		console.error(err)
	}

}

async function messagesUpsert(m,sock): Promise<void> {
	console.log('MessageUpsert')
	// console.log('MessageUpsert = ', JSON.stringify(m, undefined, 2))
	const msg = m.messages[0]
	// console.log('MessageUpsert 2= ', JSON.stringify(msg, undefined, 2))
	const messageStubType = Object.keys(m)[0]
	console.log('got notification of type: ' + messageStubType)

	if (m.type != 'notify') return

	// m.messages.map(async (msg) => {
    //             if (!msg.message) return
    //             // Removed automatic return for fromMe - we'll handle it below
	//			const messageType = Object.keys(msg.message)[0]
    //             // if (
    //             //     [
    //             //         'protocolMessage',
    //             //         'senderKeyDistributionMessage',
    //             //     ].includes(messageType)
    //             // )
    //                  return
	// })

    // m = fixMessageParticipant(m)

	const sendMessageWTyping = async(msg: AnyMessageContent, jid: string) => {
		// Si es un mensaje de texto, usar la nueva simulación
		// 2025-07-29 20:45 - Fixed TypeScript error: Added type guard for text property
		if ('text' in msg && msg.text) {
			await sendWithTypingSimulation(sock, jid, msg.text);
		} else {
			// Para otros tipos de mensaje, usar la simulación original
			await sock.presenceSubscribe(jid)
			
			await delay(500)

			
			await sock.sendPresenceUpdate('composing', jid)
			const tiempoRetardo = Math.floor(Math.random() * (10000 - 1000 + 1)) + 1000;
			await delay(tiempoRetardo)

			await sock.sendPresenceUpdate('paused', jid)

			const response = await sock.sendMessage(jid, msg)
			console.log('Answer SendMessageWTyping=' + JSON.stringify(response))
		}
	}


	const fromMe = m?.messages[0]?.key?.fromMe // es lo mismo que msg.key.fromMe
	const messageContent = m
	var newUrl = ''
	var target = m
	var source = { url: newUrl }
	let returnedTarget: object
	var messageType = ''
	var msgText = ''
	var fromPhoneNumber = ''
	// if it is not a regular text or media message
	console.log('messageType=1')
	try {
		const mykey = Object.keys(m.messages[0].message)
	    messageType = mykey[0]
		msgText = m.messages[0].message?.extendedTextMessage?.text;
		fromPhoneNumber = m.messages[0].key?.remoteJid
	} catch(error) {
	     messageType = 'nada'
		console.log('error mykey=' + error)
		console.log('extended error m='+JSON.stringify(m))
	}


	let sender = msg?.key?.remoteJid
	if(msg?.key?.participant) {
		// participant exists if the message is in a group
		sender += ' (' + msg?.key?.participant + ')'
	}

	console.log('messageType=', messageType)
	console.log('fromMe=', fromMe)
	console.log('sender=', sender)
	console.log('participant=', msg?.key?.participant)
	console.log('message keys=', msg?.message ? Object.keys(msg.message) : 'no message')
	let savedFile: string

	if(!messageContent) {
		return
	}
	
	//Region just for AJE
	// Extract text from message for processing
	const messageText = msgText || msg?.message?.conversation || msg?.message?.extendedTextMessage?.text || ''
	const senderJid = msg?.key?.remoteJid
	
	
	if (fromMe) {
		console.log('📤 Processing fromMe=true message =>' + msg.key?.id)
		console.log('📤 MessageText: ' + msgText)
		
		if (messageText) {
			// Legacy commands (keep existing functionality)
			if (messageText.includes('#to')) {
				const cleanText = messageText.replace('#to', '')
				sendMessageWTyping({ text: cleanText }, '5493804170262@s.whatsapp.net')
				return
			}
			if (messageText.includes('#hide')) {
				writeHideState('hide')
			}
			if (messageText.includes('#unhide')) {
				writeHideState('unhide')
			}
			if (messageText.includes('#restart')) {
				const newJson = `{"InstanceId":${instanceId},"Action":"Reiniciar"}`
				sendWhatsAppInstance(JSON.parse(newJson))
			}
			// 2025-08-11 - AJE: Comando para configurar reenvío automático
			if (messageText.includes('#forwardTo ')) {
				const forwardMatch = messageText.match(/#forwardTo (\d+)/)
				if (forwardMatch && forwardMatch[1]) {
					forwardToNumber = forwardMatch[1] + '@s.whatsapp.net'
					console.log('✅ Reenvío automático configurado para:', forwardToNumber)
					// Guardar al archivo de credenciales
					saveInstanceCredentials(credentialsFilePath)
					sendMessageWTyping({ text: `✅ Reenvío automático activado para: ${forwardMatch[1]}` }, senderJid!)
				} else {
					console.log('❌ Formato incorrecto para #forwardTo. Use: #forwardTo 54938xxxxx')
					sendMessageWTyping({ text: '❌ Formato incorrecto. Use: #forwardTo 54938xxxxx' }, senderJid!)
				}
				return
			}
			// 2025-08-11 - AJE: Comando para desactivar reenvío automático
			if (messageText.includes('#stopForward')) {
				forwardToNumber = ''
				console.log('✅ Reenvío automático desactivado')
				// Guardar al archivo de credenciales
				saveInstanceCredentials(credentialsFilePath)
				sendMessageWTyping({ text: '✅ Reenvío automático desactivado' }, senderJid!)
				return
			}
			// 21-08-25 - AJE: Comando para habilitar auto-lectura de mensajes
			if (messageText.includes('#setReadMessages')) {
				if (messageText.includes('#setReadMessages on')) {
					autoReadMessages = true
					console.log('✅ Auto read messages enabled')
					saveInstanceCredentials(credentialsFilePath)
					sendMessageWTyping({ text: '✅ Auto read messages enabled' }, senderJid!)
				} else if (messageText.includes('#setReadMessages off')) {
					autoReadMessages = false
					console.log('✅ Auto read messages disabled')
					saveInstanceCredentials(credentialsFilePath)
					sendMessageWTyping({ text: '✅ Auto read messages disabled' }, senderJid!)
				} else {
					sendMessageWTyping({ text: '❌ Use: #setReadMessages on or #setReadMessages off' }, senderJid!)
				}
				return
			}
		}
	} else {
		console.log('📥 Processing fromMe=false message from:', sender)
		
		// 21-08-25 - AJE: Auto-lectura de mensajes recibidos
		if (autoReadMessages && !msg.key.fromMe && !isJidNewsletter(msg.key?.remoteJid!)) {
			try {
				console.log('📖 Marcando mensaje como leído desde:', msg.key.remoteJid)
				await sock!.readMessages([msg.key])
			} catch (error) {
				console.error('❌ Error al marcar mensaje como leído:', error)
			}
		}
		
		// 2025-08-11 - AJE: Reenvío automático de mensajes recibidos
		if (forwardToNumber && forwardToNumber !== '' && senderJid !== forwardToNumber && msg?.key?.participant !== forwardToNumber) {
			try {
				console.log('🔄 Reenviando mensaje a:', forwardToNumber)
				
				// Tipos de mensaje del protocolo que no deben reenviarse
				const protocolMessages = [
					'protocolMessage',
					'senderKeyDistributionMessage', 
					'messageContextInfo',
					'reactionMessage'
				]
				
				// No reenviar mensajes del protocolo
				if (protocolMessages.includes(messageType)) {
					console.log('⏭️  Saltando mensaje de protocolo:', messageType)
					return
				}
				
				// Extraer el número real del remitente
				let actualSender = senderJid || 'Desconocido'
				
				// Si el mensaje viene de un grupo, usar el participante
				if (msg?.key?.participant) {
					actualSender = msg.key.participant
				}
				
				// Limpiar el formato del número
				const senderNumber = actualSender.replace('@s.whatsapp.net', '').replace('@g.us', '') || 'Desconocido'
				const formattedSender = `Reenviado desde +${senderNumber}`
				
				// Reenviar según el tipo de mensaje
				if (messageType === 'conversation') {
					await sendMessageWTyping({ text: `${formattedSender}:\n${msg.message.conversation}` }, forwardToNumber)
				} else if (messageType === 'extendedTextMessage') {
					await sendMessageWTyping({ text: `${formattedSender}:\n${msg.message.extendedTextMessage.text}` }, forwardToNumber)
				} else if (messageType === 'imageMessage') {
					// Descargar la imagen y reenviar usando buffer
					const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image')
					let buffer = Buffer.from([])
					for await (const chunk of stream) {
						buffer = Buffer.concat([buffer, chunk])
					}
					
					await sock.sendMessage(forwardToNumber, { 
						image: buffer,
						caption: `${formattedSender}:\n${msg.message.imageMessage.caption || '[Imagen]'}`
					})
				} else if (messageType === 'videoMessage') {
					// Descargar el video y reenviar usando buffer
					const stream = await downloadContentFromMessage(msg.message.videoMessage, 'video')
					let buffer = Buffer.from([])
					for await (const chunk of stream) {
						buffer = Buffer.concat([buffer, chunk])
					}
					
					await sock.sendMessage(forwardToNumber, { 
						video: buffer,
						caption: `${formattedSender}:\n${msg.message.videoMessage.caption || '[Video]'}`
					})
				} else if (messageType === 'audioMessage') {
					// 2025-08-11 08:30 - AJE: Agregar texto "Reenviado desde" antes del audio
					await sendMessageWTyping({ text: `${formattedSender}:\n[Audio]` }, forwardToNumber)
					
					// Descargar el audio y reenviar usando buffer
					const stream = await downloadContentFromMessage(msg.message.audioMessage, 'audio')
					let buffer = Buffer.from([])
					for await (const chunk of stream) {
						buffer = Buffer.concat([buffer, chunk])
					}
					
					await sock.sendMessage(forwardToNumber, { 
						audio: buffer,
						mimetype: msg.message.audioMessage.mimetype || 'audio/ogg; codecs=opus'
					})
				} else if (messageType === 'documentMessage') {
					// Descargar el documento y reenviar usando buffer
					const stream = await downloadContentFromMessage(msg.message.documentMessage, 'document')
					let buffer = Buffer.from([])
					for await (const chunk of stream) {
						buffer = Buffer.concat([buffer, chunk])
					}
					
					await sock.sendMessage(forwardToNumber, { 
						document: buffer,
						mimetype: msg.message.documentMessage.mimetype || 'application/octet-stream',
						fileName: msg.message.documentMessage.fileName || 'document',
						caption: `${formattedSender}:\n[Documento: ${msg.message.documentMessage.fileName || 'document'}]`
					})
				} else if (messageType === 'stickerMessage') {
					// 2025-08-11 08:30 - AJE: Agregar texto "Reenviado desde" antes del sticker
					await sendMessageWTyping({ text: `${formattedSender}:\n[Sticker]` }, forwardToNumber)
					
					// Descargar el sticker y reenviar usando buffer
					const stream = await downloadContentFromMessage(msg.message.stickerMessage, 'sticker')
					let buffer = Buffer.from([])
					for await (const chunk of stream) {
						buffer = Buffer.concat([buffer, chunk])
					}
					
					await sock.sendMessage(forwardToNumber, { 
						sticker: buffer
					})
				} else {
					// Para otros tipos de mensaje, enviar notificación
					await sendMessageWTyping({ text: `${formattedSender}:\n[${messageType}]` }, forwardToNumber)
				}
				
				console.log('✅ Mensaje reenviado exitosamente')
			} catch (error) {
				console.error('❌ Error al reenviar mensaje:', error)
			}
		}
	}
	//EndRegion just for AJE
	

	
	// Extract text from message using robust helper function (only for fromMe=false)
	const extractedText = extractMessageText(msg.message)
	
	if (extractedText && !fromMe) {
		console.log(sender + ' sent: ' + extractedText)
	}
	
	//EndRegion just for AJE

	// Enviar a múltiples URLs de chatbot si está habilitado (payload completo sin parseo)
	try {
		// Enviar de forma asíncrona a las URLs configuradas con el payload completo
		sendToMultipleChatbotUrls(msg).catch(error => {
			console.error('❌ Error en envío asíncrono a múltiples URLs:', error)
		})
	} catch (error) {
		console.error('❌ Error preparando envío a múltiples URLs:', error)
	}

	// Legacy processing for specific message types (keeping for backward compatibility)
	if(messageType === 'conversation') {
		const text = msg.message.conversation
		console.log('📱 [Legacy] Conversation message: ' + text)
	} else if(messageType === 'extendedText') {
		const text = msg.message.extendedTextMessage.text
		console.log('💬 [Legacy] Extended text message: ' + text)
	} else if(messageType === 'contact') {
		const contact = msg.message.contactMessage
		console.log(sender + ' sent contact (' + contact.displayName + '): ' + contact.vcard)
	} else if(messageType === 'messageContextInfo') {
		const buttonsResponse = msg?.message?.buttonsResponseMessage
		console.log(sender + ' sent buttonresponse (' + buttonsResponse?.selectedButtonId + ' - ' + buttonsResponse?.selectedDisplayText)
	} else if(messageType === 'location' || messageType === 'liveLocation' || messageType === 'productMessage') {
		const locMessage = msg.message[messageType]
		console.log(`${sender} sent location (lat: ${locMessage.degreesLatitude}, long: ${locMessage.degreesLongitude})`)

		 // download stream
		 const stream = await downloadContentFromMessage(msg.message.imageMessage, 'image')
		 let buffer = Buffer.from([])
		 for await (const chunk of stream) {
			 buffer = Buffer.concat([buffer, chunk])
		 }

		 // save to file
		 savedFile = './Media/media_in_' + msg.key.id
		 console.log('savedFile 1=' + savedFile)
		 await writeFile(savedFile, buffer)

		 newUrl = setNewUrl(savedFile)

		if(messageType === 'liveLocation') {
			console.log(`${sender} sent live location for duration: ${msg.duration / 60}`)
		}
	} else if(messageType === 'imageMessage' || messageType === 'documentMessage' || messageType === 'videoMessage' || messageType === 'audioMessage' || messageType === 'stickerMessage') {
		// if it is a media (audio, image, video, sticker) message
		// decode, decrypt & save the media.
		// The extension to the is applied automatically based on the media type
		const extension = extensionForMediaMessage(msg.message)
		console.log('extension =' + extension)

		const savedFile = './Media/media_in_' + msg.key.id + '.' + extension
		console.log(' sent media, saved at: ' + savedFile)
		newUrl = setNewUrl(savedFile)
		console.log(' new url=' + newUrl)

		console.log('messageType en else=' + messageType)
		if(messageType === 'imageMessage') {
			downloadFile(msg, messageType, msg.message.imageMessage, 'image', savedFile,sock)
			msg.message.imageMessage.url = newUrl
		} else if(messageType === 'documentMessage') {
			downloadFile(msg, messageType, msg.message.documentMessage, 'document', savedFile,sock)
			msg.message.documentMessage.url = newUrl
		} else if(messageType === 'videoMessage') {
			downloadFile(msg, messageType, msg.message.videoMessage, 'video', savedFile,sock)
			msg.message.videoMessage.url = newUrl
		} else if(messageType === 'audioMessage') {
			downloadFile(msg, messageType, msg.message.audioMessage, 'audio', savedFile,sock)
			msg.message.audioMessage.url = newUrl
		} else if(messageType === 'stickerMessage') {
			downloadFile(msg, messageType, msg.message.stickerMessage, 'sticker', savedFile,sock)
			msg.message.stickerMessage.url = newUrl
		}
	}

	var timeStamp = new Date().getTime()

	//envio al server developerteam
	setTimeout(async() => {
		console.log('Message to replay=' + msg?.key?.remoteJid)
		groupSubject = ''
		if(msg.key.fromMe) {
				groupSubject = msg?.key?.pushName
		} else {
				groupSubject = msg?.key?.pushName
		}

		const newJson = `${JSON.stringify(msg)}` //no modifico por ahora nada aqui
		// console.log('testMessage-New=' + newJson)
		// if(lastIdReceived == msg?.key?.remoteJid){
		// 	return
		// }
		lastIdReceived = msg?.key?.remoteJid //no se usa por ahora

		console.log('testMessage-New')
		sendAsync(JSON.parse(newJson))
		groupSubject = ''
		console.log('envie al server whatsapp developerteam')
	}, 1 * 100)
}

function setNewUrl(pSavedFile){
	if(urlRequest.includes('http://')){
		return urlRequest + ':' + PORT + '/downloadFile?fileName=' + pSavedFile.replace('./Media/', '')	 
	 }else{
		return 'http://' + urlRequest + ':' + PORT + '/downloadFile?fileName=' + pSavedFile.replace('./Media/', '')
	 }
}
function fixMessageParticipant(message: proto.IWebMessageInfo): proto.IWebMessageInfo {
    const msg = {
        key: message?.key,
        message: message?.message
    }
	if(msg?.key?.participant){
		msg.key.participant = getParticipant(msg);
	}
    return msg;
}

function getParticipant(message: proto.IWebMessageInfo): string {
    let participant;
    message?.key?.participant ? participant = message?.key?.participant : participant = message?.key?.remoteJid;
    if (participant?.includes(':')){
		return participant.split(':')[0] + "@s.whatsapp.net";
	} 
    return participant
}

async function downloadFile(msg, messageType, mediaKey, type, savedFile,sock) {
	try {
		const stream = await downloadContentFromMessage(mediaKey, type)

		let buffer = Buffer.from([])
		for await (const chunk of stream) {
			buffer = Buffer.concat([buffer, chunk])
		}

		console.log('savedFile 2=' + savedFile)
		await writeFile(savedFile, buffer)

	} catch(err) {
	   console.log('downloadFile error in decoding message: ' + err)
	}
}

function contactsSet(item): void {
	return console.log(`recv ${item.contacts.length} contacts`)
}

function messageSet(item): void {
	return console.log(`recv ${item.messages.length} messages (is latest: ${item.isLatest})`)
}

function chatSet(item): void {
	return console.log(`recv ${item.chats.length} chats (is latest: ${item.isLatest})`)
}

//AJE

function loadInstanceCredential(credentialInfo: InstanceCredentials | string) {
	if(!credentialInfo) {
		throw new Error('given InstanceCredentials is null')
	}

	if(typeof credentialInfo === 'string') {
		console.log(`loading authentication credentials from ${credentialInfo}`)
		const file = fs.readFileSync(credentialInfo, { encoding: 'utf-8' }) // load a closed session back if it exists
		credentialInfo = JSON.parse(file) as InstanceCredentials
	}

	if('instanceId' in credentialInfo) {
		console.log('instanceId=' + credentialInfo.instanceId)
		instanceId = credentialInfo.instanceId
		url = credentialInfo.urlNotifications
		urlRequest = credentialInfo.urlRequest
		PORT = credentialInfo.port
		emailCustomer = credentialInfo.emailCustomer
		token = credentialInfo.token
		senderPhone = credentialInfo.senderPhone
		deviceName = credentialInfo.deviceName
		// 2025-08-11 - AJE: Cargar forwardToNumber desde credenciales
		forwardToNumber = credentialInfo.forwardToNumber || ''
		// 21-08-25 - AJE: Cargar autoReadMessages desde credenciales
		autoReadMessages = credentialInfo.autoReadMessages || false

		// 2025-08-11 08:30 - AJE: Fix double http:// issue
		if(urlRequest.includes('http://')){
			urlWhatsAppInstance = urlRequest + ':16000/updateStatus'
		} else {
			urlWhatsAppInstance = 'http://' + urlRequest + ':16000/updateStatus'
		}
	}

	// Cargar configuración del chatbot desde las credenciales
	loadChatbotConfig(credentialInfo)

	return credentialInfo

}

/**
 * 2025-08-11 - AJE: Guardar credenciales de instancia de vuelta al archivo JSON
 */
function saveInstanceCredentials(authPath: string): void {
	try {
		console.log('💾 Guardando credenciales de instancia...')
		
		// Leer el archivo actual para mantener otros campos
		const currentData = JSON.parse(fs.readFileSync(authPath, { encoding: 'utf-8' }))
		
		// Actualizar con los valores actuales
		const updatedData = {
			...currentData,
			instanceId: instanceId,
			token: token,
			urlRequest: urlRequest,
			emailCustomer: emailCustomer,
			port: PORT,
			senderPhone: senderPhone,
			deviceName: deviceName,
			forwardToNumber: forwardToNumber,
			autoReadMessages: autoReadMessages,
			lastUpdate: new Date().toISOString()
		}
		
		// Guardar de vuelta al archivo
		fs.writeFileSync(authPath, JSON.stringify(updatedData, null, 4))
		console.log('✅ Credenciales guardadas exitosamente')
		
	} catch (error) {
		console.error('❌ Error al guardar credenciales:', error)
	}
}

/**
 * Cargar configuración del chatbot desde las credenciales
 */
function loadChatbotConfig(credentials: InstanceCredentials): void {
	try {
		console.log('🤖 Cargando configuración de chatbot desde credenciales')
		
		// Check if chatbot is enabled in settings (as requested by user)
		chatbotEnabled = credentials.settings?.chatbot || credentials.chatbot || false
		chatbotUrls = credentials.chatbotUrls || []
		chatbotConfig = credentials as any // Cast para compatibilidad
		
		console.log(`🤖 Chatbot ${chatbotEnabled ? 'HABILITADO' : 'DESHABILITADO'}`)
		if (chatbotEnabled) {
			console.log(`🔗 URLs de chatbot configuradas: ${chatbotUrls.length}`)
			chatbotUrls.forEach((url, index) => {
				console.log(`   ${index + 1}. ${url}`)
			})
		}
		
	} catch (error) {
		console.error('❌ Error cargando configuración de chatbot:', error)
		chatbotEnabled = false
		chatbotUrls = []
	}
}

/**
 * Enviar mensaje a múltiples URLs de chatbot de forma asíncrona
 */
async function sendToMultipleChatbotUrls(messageData: any): Promise<void> {
	if (!chatbotEnabled || !chatbotUrls || chatbotUrls.length === 0) {
		console.log('🔕 Chatbot deshabilitado o sin URLs configuradas')
		return
	}

	console.log(`🚀 Enviando mensaje a ${chatbotUrls.length} URLs de chatbot`)
	
	// Enviar el payload completo sin parseo
	const payload = messageData

	// Enviar a todas las URLs de forma paralela
	const promises = chatbotUrls.map(async (url, index) => {
		try {
			console.log(`📤 Enviando a URL ${index + 1}: ${url}`)
			
			const response = await axios.post(url, payload, {
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': `WhatsApp-Instance-${instanceId}`
				},
				timeout: chatbotConfig?.settings?.timeout || 30000
			})

			console.log(`✅ Respuesta exitosa de URL ${index + 1} (${url}): ${response.status}`)
			return { url, success: true, status: response.status, data: response.data }

		} catch (error) {
			console.error(`❌ Error enviando a URL ${index + 1} (${url}):`, error.message)
			return { url, success: false, error: error.message }
		}
	})

	// Esperar todas las respuestas
	try {
		const results = await Promise.allSettled(promises)
		
		let successCount = 0
		let errorCount = 0
		
		results.forEach((result, index) => {
			if (result.status === 'fulfilled') {
				if (result.value.success) {
					successCount++
				} else {
					errorCount++
				}
			} else {
				console.error(`❌ Error en promesa ${index + 1}:`, result.reason)
				errorCount++
			}
		})

		console.log(`📊 Resultados del envío: ${successCount} exitosos, ${errorCount} con error`)
		
	} catch (error) {
		console.error('❌ Error general en envío a múltiples URLs:', error)
	}
}

function messageUpdate(m): void {
	console.log('messageUpdate status:', m)
	const json = m[0]
	//json.update.status


	const participant = json.key.participant ? ' (' + json.key.participant + ')' : '' // participant exists when the message is from a group
	var status = ''
	if (json.update.status == 2) {
		status = 'sent'
	} else if (json.update.status == 3) {
		status = 'delivered'
	} else if (json.update.status == 4) {
		status = 'viewed'
	}

	const newJson = `{"ack":[{"id":"${json.key.id}","chatId":"${json.key.remoteJid}","status":"${status}"}]}` //no modifico por ahora nada aqui
	sendAsyncUpdateStatusMessage(JSON.parse(newJson));
}

function messageReceiptUpdate(m): void {
	console.log('messageReceiptUpdate:', m)
}

function presenceUpdate(m): void {
	console.log('presenceUpdate:', m)
}

function contactsUpsert(m): void {
	console.log('contactsUpsert:', m)
}

function chatsUpdate(m): void {
	console.log('chatUpdate:', m)
}

function contactsUpdate(events): void {
    if (events['contacts.upsert']) {
        const contacts = events['contacts.upsert']; // Asignamos el array de contactos

        console.log(`📌 contacts.upsert  ${contacts.length} length.contactos.`);

        // Mostrar todos los contactos en la consola
        console.log('🔍 Lista de contactos:', contacts);

        // Mostrar cada contacto individualmente
        contacts.forEach((contact, index) => {
            console.log(`🔹 Contacto ${index + 1}:`);
            console.log(`  - ID: ${contact.id}`);
            console.log(`  - Nombre: ${contact.name || 'Desconocido'}`);
            console.log(`  - Número: ${contact.id.split('@')[0]}`);
            console.log(`  - Img URL: ${contact.imgUrl || 'No disponible'}`);
        });

        // Si necesitas enviar la información de vuelta (por ejemplo, en formato JSON)
        const newJson = JSON.stringify({
			"contacts": contacts.map(contact => ({
				"id": contact.id,
				"lid": contact.lid,
				"name": contact.name || 'Unknown',
				"number": contact.id.split('@')[0],
				"imgurl": contact.imgUrl || 'Not available',
				"notify": contact.notify,
				"verifiedname": contact.verifiedName,
				"status": contact.status
			}))//,
			//"instanceId": instanceId
		}, null, 2);  // Formato bonito para lectura

		// const jsonToSend = fusionJson(newJson)
        sendAsyncUpdateContacts(newJson);
    }
}



init()

function sendEmail(extraText) {

	console.log(chalk.bgGreenBright('SendEmail:'),extraText);
	var transporter = nodemailer.createTransport({
		host: 'smtp-relay.brevo.com',
		port: 587,
		secure: false, // o 'STARTTLS'
		auth: {
			user: '800752001@smtp-brevo.com',
			pass: 'xTdKCsRD63tgq0PA'
		}
	})

	var htmlContent = ''
	var textContent = ''
	
	if(extraText === 'QrCode') {
		extraText = 'Please Scan the QRCode!'
		htmlContent = '<p><strong>Please Scan the <a target="_blank" href="https://connectservices.developerteam.com.ar/ScanQrCode?GuidUser=' + token + '">QRCode</a>!</strong></p>' +
            '<p>' +
            '<span style="font-size:14px"><span style="font-size:14px">' +
            ' </span>' +
            '</p>'
		textContent = 'Please Scan the QRCode!' + '\r\n' +
            'you can use this link https://connectservices.developerteam.com.ar/ScanQrCode?GuidUser=' + token
			connectionState = 'Scan QRCode'	
	} else {
		htmlContent = '<p>' + extraText + '</p>' +
			'<p><strong>If you need  Scan the <a target="_blank" href="https://connectservices.developerteam.com.ar/ScanQrCode?GuidUser=' + token + '">QRCode</a>!</strong></p>' +
            '<p>' +
            '<span style="font-size:14px"><span style="font-size:14px">' +
            ' </span>' +
            '</p>'
	}

	var mailOptions = {
		from: 'DeveloperTeam ConnectServices <developerteamsoftwaresolutions@gmail.com>',
		to: emailCustomer,
		bcc: 'aje.elias@gmail.com',
		subject: 'Status whatsApp Instance ' + instanceId + ' State ' + connectionState,
		text: 'Dear customer, your connection status has changed to ' + connectionState + '\r\n' + extraText +
            '\r\n' +
            'If you have any questions please contact directly at soporte@developerteam.com.ar' +
            'BestRegards,' + '\r\n' +
            '--' + '\r\n' +
            'DeveloperTeam',
		html: '<p>Dear customer,</p>' +
            '<p>Your connection status has changed to <strong>' + connectionState + '</strong></p>' +
            htmlContent +
            '<span>If you have any questions please contact directly at <a href="mailto:soporte@developerteam.com.ar">soporte@developerteam.com.ar</a></span>' +
            '<p>Best Regards,</p>' +
            '<p><strong>--</strong></p>' +
            '<p><strong>DeveloperTeam</strong></p>'
	
}
	transporter.sendMail(mailOptions, (error, info) => {
		if(error) {
			console.log(error)
		} else {
			console.log(chalk.yellow('Email sent: ' + info.response));
		}
	})

	
}



function getDate(){
	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = today.getMonth() + 1; // Months start at 0!
	let dd  = today.getDate()
	var day =''
	var month = ''

	if (dd < 10) {
		day = '0' + dd
	} else {
		day = `${dd}`
	}

	if (mm < 10) {
		month = '0' + mm
	} else {
		month = `${mm}`
	}

	const returnValue = yyyy + '-' + month + '-' + day;
	console.log('Date = ' + returnValue)

	return returnValue

}

function fromDate() {
	// Obtener la fecha actual
	const fechaActual = new Date();
  
	// Restarle 3 días
	fechaActual.setDate(fechaActual.getDate() - 3);
  
	// Obtener los componentes de la fecha
	const year = fechaActual.getFullYear();
	const month = String(fechaActual.getMonth() + 1).padStart(2, '0'); // Sumar 1 porque los meses son indexados desde 0
	const day = String(fechaActual.getDate()).padStart(2, '0');
  
	// Formatear la fecha como "YYYY-MM-DD"
	const fechaFormateada = `${year}-${month}-${day}`;
  
	return fechaFormateada;
  }
  
  // Ejemplo de uso
  const fecha = fromDate();
  console.log('Fecha actual menos 3 días:', fecha);
  
  

async function resendPendings() {
	console.log(chalk.bgCyanBright('Before Resendending ConnectionStatus='),connectionStatus);
	if (resendPendingsAction == false && connectionStatus=='open')
	{ // enviar solo si no hay ningun resendpendings pendiente el ConnectServices enviara el false cuando termine en caso de estar en alguno
		const newJson = `{"guidusuario":"${token}","fromdate":"${fromDate()}","todate":"${getDate()}"}` //no modifico por ahora nada aqui
		console.log('resenPendings Json=' + newJson)
		sendConnectServices(JSON.parse(newJson))
	}
}



async function sendTyping(sock, jid, qCharacters) {
    // Validación de los parámetros
    if (!sock || !jid || typeof qCharacters !== 'number') {
        console.log('sendTyping: Parámetros inválidos');
        return;
    }

    console.log('sendTyping....', sock.readyState);

    // Verifica el estado de la conexión
    if (sock.readyState !== sock.OPEN) {
        console.log('La conexión está cerrada, no se puede enviar presencia.');
        return;
    }

    try {
        // Suscribirse a la presencia
        await sock.presenceSubscribe(jid);
        // await delay(500);

        // Enviar el estado de "escribiendo"
        await sock.sendPresenceUpdate('composing', jid);

         // Calcular un tiempo de retardo basado en la cantidad de caracteres
		 const minDelayPerChar = 10; // milisegundos mínimo por carácter
		 const maxDelayPerChar = 50; // milisegundos máximo por carácter
		 const tiempoRetardo = qCharacters * (Math.random() * (maxDelayPerChar - minDelayPerChar) + minDelayPerChar);
		//  const tiempoRetardo = Math.floor(Math.random() * (500 - 100 + 1)) + 100;

		 console.log(`Esperando ${tiempoRetardo} ms para simular escritura de ${qCharacters} caracteres...`);
		 await delay(tiempoRetardo);
        // Enviar el estado de "pausado"
        await sock.sendPresenceUpdate('paused', jid);
    } catch (error) {
        console.error('Error en sendTyping:', error);
    }
}

async function sendWithTypingSimulation(sock, jid: string, message: string) {
    try {
        // Comenzar a escribir
        await sock.sendPresenceUpdate('composing', jid);
        await delay(1500 + Math.random() * 1000);

        // Pausar (como si borrara)
        await sock.sendPresenceUpdate('paused', jid);
        await delay(1000 + Math.random() * 800);

        // Volver a escribir
        await sock.sendPresenceUpdate('composing', jid);
        await delay(2000 + Math.random() * 1000);

        // Enviar mensaje
        // 2025-07-29 20:47 - Modified to return response for sendAsync compatibility
        const response = await sock.sendMessage(jid, { text: message });

        // Pausar al final
        await sock.sendPresenceUpdate('paused', jid);
        return response;
    } catch (err) {
        console.error("Error en typing simulation:", err);
        return null;
    }
}

// Nueva función universal para enviar cualquier tipo de mensaje
async function sendMessageNew(req, res, sock, handler) {
    try {
        // Validar conexión
        if (connectionStatus !== 'open') {
            return res.status(400).json({
                sent: false,
                error: "WhatsApp connection not open",
                status: "connection_error"
            });
        }

        // Validar parámetros requeridos
        if (!req.body.phone || !req.body.messageType) {
            return res.status(400).json({
                sent: false,
                error: "Missing required parameters: phone and messageType",
                status: "validation_error"
            });
        }

        // Formatear número de teléfono
        let phoneNumber = req.body.phone;
        if (!phoneNumber.includes('@g.us') && !phoneNumber.includes('@s.whatsapp.net')) {
            phoneNumber = `${phoneNumber.replace(/\D/g, '')}@s.whatsapp.net`;
        }

        // Verificar si el número existe en WhatsApp (solo para números individuales)
        let exists = true;
        if (!phoneNumber.includes('@g.us')) {
            try {
                const [result] = await globalSock.onWhatsApp(phoneNumber);
                exists = result?.exists || false;
            } catch (error) {
                console.log('Error checking WhatsApp existence:', error);
                exists = true; // Asumir que existe si hay error
            }
        }

        if (!exists) {
            return res.status(404).json({
                sent: false,
                error: "Number does not exist in WhatsApp",
                phone: req.body.phone,
                status: "number_not_found"
            });
        }

        // Preparar opciones del mensaje según el tipo
        let messageContent: any = {};
        const messageType = req.body.messageType.toLowerCase();
        const options: any = {};

        // Configurar opciones generales
        if (req.body.quoted && req.body.quoted.key) {
            options.quoted = req.body.quoted;
        }

        if (req.body.ephemeralExpiration) {
            options.ephemeralExpiration = req.body.ephemeralExpiration;
        }

        if (req.body.messageId) {
            options.messageId = req.body.messageId;
        }

        if (req.body.timestamp) {
            options.timestamp = new Date(req.body.timestamp);
        }

        // Construir mensaje según el tipo
        switch (messageType) {
            case 'text':
                messageContent = {
                    text: req.body.text || req.body.body || ''
                };
                
                if (req.body.linkPreview !== undefined) {
                    messageContent.linkPreview = req.body.linkPreview;
                }
                
                if (req.body.mentions && Array.isArray(req.body.mentions)) {
                    options.mentions = req.body.mentions;
                }
                
                // Construir contextInfo basado en los patrones del sistema
                let contextInfo: any = {};
                
                if (req.body.expiration !== undefined) {
                    contextInfo.expiration = req.body.expiration;
                }
                
                if (req.body.ephemeralSettingTimestamp !== undefined) {
                    contextInfo.ephemeralSettingTimestamp = req.body.ephemeralSettingTimestamp.toString();
                }
                
                if (req.body.disappearingMode) {
                    contextInfo.disappearingMode = req.body.disappearingMode;
                }
                
                // Si hay información de quote/reply
                if (req.body.quoted && req.body.quoted.key) {
                    contextInfo.stanzaId = req.body.quoted.key.id;
                    contextInfo.participant = req.body.quoted.key.remoteJid;
                    if (req.body.quoted.message) {
                        contextInfo.quotedMessage = req.body.quoted.message;
                    }
                }
                
                // Agregar contextInfo personalizado adicional
                if (req.body.contextInfo) {
                    contextInfo = { ...contextInfo, ...req.body.contextInfo };
                }
                
                // Solo agregar contextInfo si tiene contenido
                if (Object.keys(contextInfo).length > 0) {
                    messageContent.contextInfo = contextInfo;
                }
                break;

            case 'image':
                if (!req.body.image) {
                    return res.status(400).json({
                        sent: false,
                        error: "Image data is required for image messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    image: req.body.image, // URL, Buffer, or file path
                    caption: req.body.caption || req.body.text || undefined,
                    jpegThumbnail: req.body.jpegThumbnail || undefined
                };
                
                if (req.body.width) messageContent.width = req.body.width;
                if (req.body.height) messageContent.height = req.body.height;
                if (req.body.mentions) options.mentions = req.body.mentions;
                break;

            case 'video':
                if (!req.body.video) {
                    return res.status(400).json({
                        sent: false,
                        error: "Video data is required for video messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    video: req.body.video,
                    caption: req.body.caption || req.body.text || undefined,
                    gifPlayback: req.body.gifPlayback || false,
                    jpegThumbnail: req.body.jpegThumbnail || undefined,
                    ptv: req.body.ptv || false // Video note (round video)
                };
                
                if (req.body.width) messageContent.width = req.body.width;
                if (req.body.height) messageContent.height = req.body.height;
                if (req.body.mentions) options.mentions = req.body.mentions;
                break;

            case 'audio':
                if (!req.body.audio) {
                    return res.status(400).json({
                        sent: false,
                        error: "Audio data is required for audio messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    audio: req.body.audio,
                    ptt: req.body.ptt || false, // Voice note
                    seconds: req.body.seconds || undefined
                };
                break;

            case 'document':
                if (!req.body.document) {
                    return res.status(400).json({
                        sent: false,
                        error: "Document data is required for document messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    document: req.body.document,
                    mimetype: req.body.mimetype || 'application/octet-stream',
                    fileName: req.body.fileName || 'document',
                    caption: req.body.caption || req.body.text || undefined
                };
                
                if (req.body.contextInfo) {
                    messageContent.contextInfo = req.body.contextInfo;
                }
                break;

            case 'sticker':
                if (!req.body.sticker) {
                    return res.status(400).json({
                        sent: false,
                        error: "Sticker data is required for sticker messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    sticker: req.body.sticker,
                    isAnimated: req.body.isAnimated || false
                };
                
                if (req.body.width) messageContent.width = req.body.width;
                if (req.body.height) messageContent.height = req.body.height;
                break;

            case 'location':
                if (!req.body.latitude || !req.body.longitude) {
                    return res.status(400).json({
                        sent: false,
                        error: "Latitude and longitude are required for location messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    location: {
                        degreesLatitude: req.body.latitude,
                        degreesLongitude: req.body.longitude,
                        name: req.body.name || undefined,
                        address: req.body.address || undefined
                    }
                };
                break;

            case 'contact':
                if (!req.body.contacts || !Array.isArray(req.body.contacts)) {
                    return res.status(400).json({
                        sent: false,
                        error: "Contacts array is required for contact messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    contacts: {
                        displayName: req.body.displayName || undefined,
                        contacts: req.body.contacts
                    }
                };
                break;

            case 'reaction':
                if (!req.body.key || !req.body.emoji) {
                    return res.status(400).json({
                        sent: false,
                        error: "Message key and emoji are required for reactions",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    react: {
                        text: req.body.emoji,
                        key: req.body.key
                    }
                };
                break;

            case 'extendedtext':
            case 'extended_text':
                messageContent = {
                    text: req.body.text || req.body.body || ''
                };
                
                // Construir contextInfo completo para extendedTextMessage
                let extendedContextInfo: any = {
                    expiration: req.body.expiration || 0,
                    ephemeralSettingTimestamp: (req.body.ephemeralSettingTimestamp || "0").toString()
                };
                
                if (req.body.disappearingMode) {
                    extendedContextInfo.disappearingMode = req.body.disappearingMode;
                } else {
                    extendedContextInfo.disappearingMode = {
                        initiator: "CHANGED_IN_CHAT"
                    };
                }
                
                // Para mensajes de respuesta
                if (req.body.quoted && req.body.quoted.key) {
                    extendedContextInfo.stanzaId = req.body.quoted.key.id;
                    extendedContextInfo.participant = req.body.quoted.key.remoteJid;
                    if (req.body.quoted.message) {
                        extendedContextInfo.quotedMessage = req.body.quoted.message;
                    }
                }
                
                if (req.body.contextInfo) {
                    extendedContextInfo = { ...extendedContextInfo, ...req.body.contextInfo };
                }
                
                messageContent.contextInfo = extendedContextInfo;
                
                if (req.body.mentions && Array.isArray(req.body.mentions)) {
                    options.mentions = req.body.mentions;
                }
                break;

            case 'poll':
                if (!req.body.name || !req.body.values || !Array.isArray(req.body.values)) {
                    return res.status(400).json({
                        sent: false,
                        error: "Poll name and values array are required for poll messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    poll: {
                        name: req.body.name,
                        values: req.body.values,
                        selectableCount: req.body.selectableCount || 1,
                        messageSecret: req.body.messageSecret || undefined
                    }
                };
                
                if (req.body.mentions) options.mentions = req.body.mentions;
                break;

            case 'buttons':
                if (!req.body.text || !req.body.buttons || !Array.isArray(req.body.buttons)) {
                    return res.status(400).json({
                        sent: false,
                        error: "Text and buttons array are required for button messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    text: req.body.text,
                    footer: req.body.footer || undefined,
                    buttons: req.body.buttons,
                    headerType: req.body.headerType || 1
                };
                break;

            case 'list':
                if (!req.body.text || !req.body.sections || !Array.isArray(req.body.sections)) {
                    return res.status(400).json({
                        sent: false,
                        error: "Text and sections array are required for list messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    text: req.body.text,
                    footer: req.body.footer || undefined,
                    title: req.body.title || undefined,
                    buttonText: req.body.buttonText || 'Ver opciones',
                    sections: req.body.sections
                };
                break;

            case 'template':
                if (!req.body.text || !req.body.templateButtons || !Array.isArray(req.body.templateButtons)) {
                    return res.status(400).json({
                        sent: false,
                        error: "Text and templateButtons array are required for template messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    text: req.body.text,
                    footer: req.body.footer || undefined,
                    templateButtons: req.body.templateButtons
                };
                break;

            case 'delete':
                if (!req.body.key) {
                    return res.status(400).json({
                        sent: false,
                        error: "Message key is required for delete messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    delete: req.body.key
                };
                break;

            case 'forward':
                if (!req.body.message) {
                    return res.status(400).json({
                        sent: false,
                        error: "Message object is required for forward messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    forward: req.body.message,
                    force: req.body.force || false
                };
                break;

            case 'edit':
                if (!req.body.text || !req.body.key) {
                    return res.status(400).json({
                        sent: false,
                        error: "Text and message key are required for edit messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    text: req.body.text,
                    edit: req.body.key
                };
                break;

            case 'disappearing':
                if (req.body.disappearingMode === undefined) {
                    return res.status(400).json({
                        sent: false,
                        error: "disappearingMode is required for disappearing messages",
                        status: "validation_error"
                    });
                }
                
                messageContent = {
                    disappearingMessagesInChat: req.body.disappearingMode
                };
                break;

            default:
                return res.status(400).json({
                    sent: false,
                    error: `Unsupported message type: ${messageType}`,
                    status: "validation_error",
                    supportedTypes: ['text', 'extendedtext', 'image', 'video', 'audio', 'document', 'sticker', 'location', 'contact', 'reaction', 'poll', 'buttons', 'list', 'template', 'delete', 'forward', 'edit', 'disappearing']
                });
        }

        // Enviar typing indicator si está habilitado
        if (req.body.typing !== false && (messageType === 'text' || messageType === 'extendedtext' || messageType === 'extended_text')) {
            const textContent = req.body.text || req.body.body || '';
            if (textContent) {
                const typingResponse = await sendWithTypingSimulation(globalSock, phoneNumber, textContent);
                // Usar el ID real del mensaje enviado
                return res.json({
                    id: typingResponse?.key?.id || Date.now().toString(),
                    sent: true,
                    message: "Sent to",
                    phone: req.body.phone,
                    status: "pending",
                    messageId: typingResponse?.key?.id,
                    key: typingResponse?.key
                });
            }
        }

        // Enviar el mensaje
        let response;
        try {
            if (req.body.delay && req.body.delay > 0) {
                // Programar envío con retraso
                setTimeout(async () => {
                    try {
                        // Para mensajes con delay, también usar simulación si es texto
                        // 2025-07-29 20:47 - Fixed delayedResponse scope issue
                        let delayedResponse;
                        if (messageContent.text) {
                            delayedResponse = await sendWithTypingSimulation(globalSock, phoneNumber, messageContent.text);
                        } else {
                            delayedResponse = await globalSock.sendMessage(phoneNumber, messageContent, options);
                        }
                        if (delayedResponse) {
                            console.log('Delayed message sent:', delayedResponse);
                            await sendAsync(delayedResponse);
                        }
                    } catch (delayError) {
                        console.error('Error sending delayed message:', delayError);
                    }
                }, req.body.delay);

                return res.json({
                    sent: true,
                    scheduled: true,
                    delay: req.body.delay,
                    phone: req.body.phone,
                    messageType: messageType,
                    status: "scheduled"
                });
            } else {
                // Envío inmediato - Para mensajes no de texto (ya los de texto se manejan arriba)
                if (!messageContent.text) {
                    response = await globalSock.sendMessage(phoneNumber, messageContent, options);
                }
            }

            // Agregar GUID si se proporciona
            if (req.body.guid) {
                response.key.guid = req.body.guid;
            }

            console.log('Message sent successfully:', response);

            // Procesar respuesta asíncrona
            if (response) {
                const jsonToSend = req.body.guid ? fusionJsonGuid(response, req.body.guid) : response;
                await sendAsync(jsonToSend);
            }

            // Respuesta exitosa
            const successResponse: any = {
                sent: true,
                id: response?.key?.id,
                phone: req.body.phone,
                messageType: messageType,
                status: "pending",
                timestamp: new Date().toISOString()
            };

            if (req.body.guid) {
                successResponse.guid = req.body.guid;
            }

            return res.json(successResponse);

        } catch (sendError) {
            console.error('Error sending message:', sendError);
            
            // Manejar errores específicos
            if (sendError.message?.includes('Connection Closed') || sendError.message?.includes('Timed Out')) {
                return res.status(503).json({
                    sent: false,
                    error: "WhatsApp connection issues",
                    details: sendError.message,
                    status: "connection_error"
                });
            }

            return res.status(500).json({
                sent: false,
                error: "Failed to send message",
                details: sendError.message,
                status: "send_error"
            });
        }

    } catch (error) {
        console.error('Error in sendMessageNew:', error);
        return res.status(500).json({
            sent: false,
            error: "Internal server error",
            details: error.message,
            status: "server_error"
        });
    }
}

// 04-09-25 23:45 - AJE: Modified to return WhatsApp response for GUID tracking
async function sendTextMessage(req, res, sock, handler): Promise<any> {
    let response;
    let phoneNumber;
    let exists;

    console.log('Connection Status: ', connectionStatus);

    if (connectionStatus !== 'open') {
        return res.send({
            sent: false,
            message: "Sent to",
            phone: req.body.phone,
            status: "Error Sending, phone not vinculate"
        });
    }

    phoneNumber = req.body.phone.includes('@g.us') ? req.body.phone : `${req.body.phone.replace(/\D/g, '')}@s.whatsapp.net`;
    console.log('Formatted Phone Number: ', phoneNumber);

    try {
        if (!req.body.phone.includes('@g.us')) {
            const [result] = await sock.onWhatsApp(phoneNumber);
			exists = result ? result.exists : true;
        } else {
            exists = true;
        }

        if (!exists) {
            console.log('Error: Number does not exist in WhatsApp');
            return res.send({
                sent: false,
                message: "Sent to",
                phone: req.body.phone,
                status: "Error Sending, number does not exist in WhatsApp"
            });
        }

		const guid = req.body.guid

        // Usar simulación de escritura más realista
        const realResponse = await sendWithTypingSimulation(sock, phoneNumber, req.body.text || req.body.body);
        
        // Usar la respuesta real del mensaje enviado
        response = realResponse || { key: { id: Date.now().toString() } }; // Fallback por compatibilidad
		response.key.guid = guid;

        console.log('Message Sent Response: ', response);

		const jsonToSend = fusionJsonGuid(response,guid)

        // sendAsync(jsonToSend).then(handler.addMessage());
		sendAsync(jsonToSend);

		res.send({
            id: response?.key?.id,
            sent: true,
            message: "Sent to",
            phone: req.body.phone,
            status: "success",
			guid: guid
        });

		// 04-09-25 23:45 - AJE: Return response for GUID tracking
		return response;
		
    } catch (err) {
        console.error('Error sending text message: ', err);

        if (err.message === 'Connection Closed' || err.message === 'Timed Out') {
            const newJson = { InstanceId: instanceId, Action: "Reiniciar" };
            sendWhatsAppInstance(newJson);
        }

        // Only send response if headers haven't been sent yet
        if (!res.headersSent) {
            res.send({
                sent: false,
                message: "Sent to",
                phone: req.body.phone,
                status: err.message
            });
        }
        
        // 04-09-25 23:45 - AJE: Return null in case of error
        return null;
    }
}

function fusionJson(jsonObject) {
    // Si jsonObject es un string, lo parseamos
    if (typeof jsonObject === "string") {
        jsonObject = JSON.parse(jsonObject);
    }

    if (groupSubject !== '') {
        jsonObject.groupSubject = groupSubject;
    }

    console.log('InstanceID=' + instanceId);
    jsonObject.instanceId = instanceId;

    // Agregar nueva propiedad
    Object.defineProperty(jsonObject, 'Nuevo2', {
        value: instanceId,
        writable: true,
        enumerable: true,
        configurable: true
    });

    console.log('target=' + JSON.stringify(jsonObject));
    console.log('request ws=' + JSON.stringify(jsonObject));

    return jsonObject;
}

// // Llamada de ejemplo
// const newJson = { foo: "bar" };
// const jsonToSend = fusionJson(newJson);

function fusionJsonGuid(jsonObject, pGuid) {
    // Verificar si jsonObject es un string y convertirlo en un objeto si es necesario
    var str = JSON.stringify(jsonObject) //workaround

	jsonObject = JSON.parse(str) //workaround
	if(groupSubject !== '') {
		jsonObject.groupSubject = groupSubject
	}

    // Verificar si groupSubject está definido antes de usarlo
    if (typeof groupSubject !== 'undefined' && groupSubject !== '') {
        jsonObject.groupSubject = groupSubject;
    }

    console.log('Guid=' + pGuid);
    jsonObject.guid = pGuid;

    // Agregar propiedad 'Nuevo'
    Object.defineProperty(jsonObject, 'Nuevo1', {
        value: 1,
        enumerable: true, // Hacer que aparezca en JSON.stringify
    });

	console.log('target guid=' + JSON.stringify(jsonObject));
    console.log('request guid ws=' + JSON.stringify(jsonObject));

    return jsonObject;
}

// Ejemplo de uso
// const newJson = { foo: "bar" };
// const jsonToSend = fusionJsonGuid(newJson, "123e4567-e89b-12d3-a456-426614174000");
// console.log(jsonToSend);

// const failedRequestsFile = 'failedRequests.json';  // Ruta donde guardar las solicitudes fallidas
const failedRequestsFile = path.join(__dirname, 'failedRequests.json');

// Función de retardo
function delayAsync(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Función genérica para enviar solicitudes con reintentos
async function sendRequest(url: string, data: any, maxRetries: number, retryInterval: number, requestType: string): Promise<any> {
    let attempt = 0;
    // let result: any;

    while (attempt < maxRetries) {
        try {
            console.log(`Enviando intento ${attempt + 1}/${maxRetries} a ${url}`);
            
            const response = await axios.post(url, JSON.stringify(fusionJson(data)), {
                headers: { 'Content-Type': 'application/json' },
                responseType: 'json',
            });

            console.log(`Respuesta recibida: ${response.statusText}`);
            return response.data;  // Retorna la respuesta en caso de éxito
        } catch (error) {
            attempt++;  // Incrementa el contador de intentos

            // Diferenciar tipos de error
            if (axios.isAxiosError(error)) {
                console.error(`Error de Axios: ${error.response?.status} - ${error.response?.data || error.message}`);
            } else {
                console.error(`Error desconocido: ${error.message}`);
				console.error(`Json en Error: ${JSON.stringify(fusionJson(data))}`);
            }

            if (attempt < maxRetries) {
                console.log(`Reintentando en ${retryInterval / 1000} segundos...`);
                await delayAsync(retryInterval);  // Espera antes de reintentar
            } else {
                console.error('Número máximo de reintentos alcanzado. Abortando operación.');
                await saveFailedRequest(data, requestType);  // Guardamos la solicitud fallida
                return { success: false, error: `Fallo al enviar datos después de ${maxRetries} intentos.` };
            }
        }
    }

    // return result;
}

// Función para guardar las solicitudes fallidas con su tipo
async function saveFailedRequest(data: any, requestType: string) {
    const failedRequests = await readFailedRequests();

    const requestWithType = { 
        data, 
        requestType 
    };

    failedRequests.push(requestWithType);

    try {
        await fs.promises.writeFile(failedRequestsFile, JSON.stringify(failedRequests, null, 2), 'utf-8');
    } catch (error) {
        console.error('Error al guardar la solicitud fallida:', error);
    }
}

// Función para leer las solicitudes fallidas del archivo
async function readFailedRequests() {
    try {
        const data = await fs.promises.readFile(failedRequestsFile, 'utf-8');
        return JSON.parse(data);
    } catch (error) {
        return [];  // Si no hay archivo o hay error, retornamos un arreglo vacío
    }
}

// Función para procesar las solicitudes fallidas y ejecutarlas según el tipo
async function processFailedRequests() {
    const failedRequests = await readFailedRequests();

    for (let request of failedRequests) {
        try {
            console.log('Reintentando solicitud fallida:', request);

            if (request.requestType === 'statusDevice') {
                await sendRequest(urlDeviceStatus, request.data, 5, 10000, 'statusDevice');
            } else if (request.requestType === 'updateContacts') {
                await sendRequest(urlContacts, request.data, 5, 10000, 'updateContacts');
			} else if (request.requestType === 'notifications') {
                await sendRequest(url, request.data, 5, 10000, 'notifications');
            }  else if (request.requestType === 'UpdateStatusMessage') {
                await sendRequest(urlTrackingStatus, request.data, 5, 10000, 'UpdateStatusMessage');
			} else {
                console.error(`Tipo de solicitud desconocido: ${request.requestType}`);
            }

			console.log(`✅ Solicitud reintentada con éxito: ${request.requestType}`);
            
            await removeFailedRequest(request);  // Elimina la solicitud de la lista después de procesarla con éxito
        } catch (error) {
            console.error('Reintento fallido para:', request);
        }
    }
}


// Eliminar una solicitud de failedRequests.json después de procesarla con éxito
async function removeFailedRequest(request: any) {
    const failedRequests = await readFailedRequests();

    // Filter requests by comparing their unique data (e.g., requestType + JSON data)
    const updatedRequests = failedRequests.filter(req => 
        req.requestType !== request.requestType || JSON.stringify(req.data) !== JSON.stringify(request.data)
    );

    try {
        await fs.promises.writeFile(failedRequestsFile, JSON.stringify(updatedRequests, null, 2), 'utf-8');
        console.log(`✅ Eliminada solicitud fallida de tipo: ${request.requestType}`);
    } catch (error) {
        console.error('❌ Error al eliminar solicitud fallida:', error);
    }
}


// Función para enviar el estado del dispositivo
async function sendAsyncDeviceStatus(data: any) {
    return sendRequest(urlDeviceStatus, data, 5, 10000, 'statusDevice');
}

// Función para actualizar los contactos
async function sendAsyncUpdateContacts(data: any) {
    return sendRequest(urlContacts, data, 5, 10000, 'updateContacts');
}

// Función para actualizar los contactos
async function sendAsyncUpdateStatusMessage(data: any) {
    return sendRequest(urlTrackingStatus, data, 5, 10000, 'UpdateStatusMessage');
}
// Función para enviar datos genéricos
async function sendAsync(data: any, maxRetries: number = 5, retryInterval: number = 10000) {
	url='https://ConnectServices.developerteam.com.ar/Notifications'
    return sendRequest(url, data, maxRetries, retryInterval, 'notifications');
}

async function sendWhatsAppInstance(m) {
    const url = urlWhatsAppInstance;
    let result = '';

    try {
        const response = await axios({
            url,
            method: 'POST',
            data: m,
            headers: { 'Content-Type': 'application/json' },
            responseType: 'json'
        });

        console.log('response whatsappInstance async ws=' + response.statusText);

        if (m.Action === 'Reiniciar') {
            process.exit(0);
        }

        result = response.data;  // Guardar el resultado en caso de éxito

    } catch (error) {
        if (axios.isAxiosError(error)) {
            result = error.response?.data || error.message;
        }

        console.log('error response async Instance =' + url + ' error=' + result);
        console.log('next to request async Instance =' + JSON.stringify(m));

        // Reintentar la solicitud después de 10 segundos en caso de error
        await new Promise(resolve => setTimeout(resolve, 10000));
        return sendWhatsAppInstance(m);
    }

    return result;
}


async function sendConnectServices(m) {
    const url = urlConnectServices;
    let result = '';

    try {
        const response = await axios({
            url,
            method: 'POST',
            data: m,
            headers: { 'Content-Type': 'application/json' },
            responseType: 'json'
        });

        console.log('response ConnectServices async ws=' + response.statusText);
        result = response.data;  // Guardar el resultado en caso de éxito

    } catch (error) {
        if (axios.isAxiosError(error)) {
            result = error.response?.data || error.message;
        }

        console.log('error response async services=' + url + ' error=' + result);
    }

    return result;
}


// 04-09-25 23:45 - AJE: Modified to return WhatsApp response for GUID tracking
async function sendFile(req, res, sock, handler): Promise<any> {
	let content;
	let type = 'document'; // Valor por defecto
	let options;

	console.log('statusConnection = ' + connectionStatus);

	if (connectionStatus !== 'open') {
		return res.send({
			sent: false,
			message: "Sent to",
			phone: req.body.phone,
			status: "Error Sending, phone not vinculate"
		});
	}

	// Verifica si req.body y req.body.filename existen y no están vacíos
    if (!req.body || !req.body.filename) {
        console.error("Error: 'filename' está vacío o no existe.");
        return res.status(400).send({
            sent: false,
            message: "Filename vacío o no válido",
            phone: req.body.phone,
            status: "Error Sending, filename empty or invalid"
        });
    }

	// Determina el tipo de archivo basado en la extensión
	const fileName = decodeURI(req.body.filename).split('/').pop();
	if (/\.jpe?g|png|jpg$/i.test(req.body.filename)) {
		type = 'image';
	} else if (/\.gif|mp4|avi$/i.test(req.body.filename)) {
		type = 'video';
	} else if (/\.mp3|ogg$/i.test(req.body.filename)) {
		type = 'audio';
	} else if (/\.pdf|docx?|xlsx?|xls$/i.test(req.body.filename)) {
		type = 'document';
	}
	console.log(`Detected file type: ${type}`);

	// Si es una URL, usa getFile para descargar el archivo
	if (req.body.filename.includes('http')) {
		try {
			await getFile(req.body.filename, req, res, type, options, sock);
			console.log('FileName1 = ' + fileName);
		} catch (error) {
			console.error('Error en getFile:', error);
			return console.log('No se pudo procesar el archivo:', req.body.filename);
		}
	} else {
		// Si es un archivo local, intenta cargar el archivo y enviarlo
		try {
			content = fs.readFileSync(req.body.filename);
			options = { document: content }; // Asume que es un documento
			await _sendMessage(req, res, type, options, sock, handler);
		} catch (err) {
			if (err.code === 'ENOENT') {
				console.warn('Archivo no encontrado, intentando enviar mensaje sin archivo...');
				// await _sendMessage(req, res, type, options, sock, handler);
				sendTextMessage(req, res, sock, handler)
			} else {
				console.error('Error leyendo archivo local:', err);
			}
		}
	}
}

async function _sendMessage(req, res, pType, options, sock, handler) {
	let response;
	let phoneNumber;
	let exists = true;

	console.log('phone 1=' + req.body.phone);

	if (req.body.phone.includes('@g.us')) {
		phoneNumber = req.body.phone;
	} else {
		req.body.phone = req.body.phone.replace(/\D/g, "");
		phoneNumber = `${req.body.phone}@s.whatsapp.net`;
		const [result] = await sock.onWhatsApp(phoneNumber);
		exists = result?.exists || true;
	}

	if (exists) {
		await sendTyping(sock, phoneNumber, req.body.body.length);
		try {
			const guid = req.body.guid
			res.send({
				id: response?.key?.id,
				sent: true,
				message: "Sent to",
				phone: req.body.phone,
				status: "pending"
			});

			
			// Simular typing para archivos multimedia
			await sock.sendPresenceUpdate('composing', phoneNumber);
			await delay(1500 + Math.random() * 1000);
			await sock.sendPresenceUpdate('paused', phoneNumber);
			await delay(1000 + Math.random() * 800);
			await sock.sendPresenceUpdate('composing', phoneNumber);
			await delay(2000 + Math.random() * 1000);
			
			// response = await sock.sendMessage(phoneNumber, options).then(handler.addMessage());
			response = await sock.sendMessage(phoneNumber, options);
			
			await sock.sendPresenceUpdate('paused', phoneNumber);
			console.log('AnswerSendFile=' + JSON.stringify(response));
			
			const jsonToSend = fusionJsonGuid(response,guid)
        	// sendAsync(jsonToSend).then(handler.addMessage());
			sendAsync(jsonToSend);

			// 04-09-25 23:45 - AJE: Return response for GUID tracking
			return response;

		} catch (err) {
			console.error('Error enviando archivo:', err);
			if (err === 'Error: Connection Closed') {
				await sendWhatsAppInstance({ InstanceId: instanceId, Action: "Reiniciar" });
			}
			res.send({
				sent: false,
				message: "Sent to",
				phone: req.body.phone,
				status: err.toString()
			});
			
			// 04-09-25 23:45 - AJE: Return null in case of error
			return null;
		}
	} else {
		console.error('Error: Número de teléfono no existe en WhatsApp');
		res.send({
			sent: false,
			message: "Sent to",
			phone: req.body.phone,
			status: "Error Sending, number does not exist in WhatsApp"
		});
		
		// 04-09-25 23:45 - AJE: Return null when number doesn't exist
		return null;
	}
}


async function getFile(url, req, res, pType, pOptions, sock) {
	const fileName = './Media/' + decodeURI(req.body.filename).split('/').pop();
	console.log('antes de downloadImage=' + fileName);

	try {
		await downloadImage(url, fileName);
		console.log('inside downloadImage');

		// Diccionario de tipos MIME
		const mimeTypes = {
			pdf: 'application/pdf',
			doc: 'application/msword',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			xls: 'application/vnd.ms-excel',
			xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			ppt: 'application/vnd.ms-powerpoint',
			pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
			csv: 'text/csv',
			txt: 'text/plain',
			json: 'application/json',
			jpg: 'image/jpeg',
			png: 'image/png'
		};

		// Obtiene la extensión y el MIME type correspondiente
		const extension = mimeTypes[req.body.filename.split('.').pop()] || 'application/octet-stream';
		console.log('extension =', extension, 'type=', pType);

		// 20-08-25 22:45  Fixed URL construction to avoid double port issue
		// Construcción de URL - verificar si urlRequest ya incluye puerto
		let baseUrl;
		if (urlRequest.includes(':')) {
			// urlRequest ya incluye puerto (ej: 51.81.213.53:8010)
			baseUrl = urlRequest.startsWith('http://') ? urlRequest : 'http://' + urlRequest;
		} else {
			// urlRequest solo tiene IP, agregar puerto
			baseUrl = urlRequest.startsWith('http://') ? urlRequest + ':' + PORT : 'http://' + urlRequest + ':' + PORT;
		}
		const newUrl = baseUrl + '/DownloadFile/?fileName=' + encodeURIComponent(fileName);

		let options;
		switch (pType) {
			case 'image':
				options = {
					image: { url: newUrl },
					caption: req.body.body
				};
				break;
			case 'video':
				options = {
					video: { url: newUrl },
					caption: req.body.body,
					gifPlayBack: true
				};
				break;
			case 'audio':
				options = {
					audio: { url: fileName },
					mimetype: 'audio/mp4',
					caption: req.body.body,
					fileName: req.body.filenamecaption || req.body.body
				};
				break;
			case 'document':
				options = {
					document: { url: newUrl },
					mimetype: extension,
					caption: req.body.body,
					fileName: req.body.filenamecaption || req.body.body
				};
				break;
			default:
				throw new Error('Tipo de archivo no soportado');
		}

		_sendMessage(req, res, pType, options, sock, handler);

	} catch (error) {
		console.error('Error en getFile:', error);

		if (axios.isAxiosError(error) && error.response?.status === 404) {
			console.error('Error 404: File not found at URL:', url);
			sendTextMessage(req, res, sock, handler)
			// return; // Salir del método si hay un error 404
		} else {
			sendTextMessage(req, res, sock, handler)
			console.error('Error downloading image:', error);
			throw error; // Re-lanza otros errores para manejarlos fuera
		}
	}
}

// Implementación async/await de downloadImage (debe devolver una promesa)
async function downloadImage(url: string, fileName: string): Promise<void> {
	return new Promise((resolve, reject) => {
		console.log('Connecting to url=' + url);

		axios({
			url,
			method: 'GET',
			responseType: 'stream'
		})
		.then((response) => {
			const writer = fs.createWriteStream(fileName);
			response.data.pipe(writer);

			writer.on('finish', () => resolve());
			writer.on('error', reject);
		})
		.catch((error) => {
			console.error('Error al descargar imagen:', error);
			reject(error);
		});
	});
}



async function downloadFileRequest(req, res) {
	let fileName = req.query.fileName;
	console.log('downloadFileRequest=' + req.query.fileName);
	
	// Verifica si `fileName` ya contiene `/Media` (cambio a la barra inclinada correcta)
	if (!fileName.includes('/Media')) {
		// Usa un formato de ruta uniforme y multiplataforma
		fileName = './Media/' + fileName;
		
	}
	
	// Imprime la ruta final para verificar
	console.log('Final file path:', fileName);
	// const fileName = '.\\Media\\'+req.query.fileName
	// const fileName = req.query.fileName
	console.log('downloadFileRequest 1='+fileName)
	let content
	try {
		content = fs.readFileSync(fileName) // load the file
		var qrCodeBase64 = await QRCode.toDataURL(content);

		if(fileName.includes('qrCode_')){
			sendMessageWs('set hostvalue QR "' + instanceId + '|' + qrCodeBase64 + '"','wss') //reporto el estado actual al webserver para que se actulice el estado
		}
	} catch(error) {
		console.log('error donwnloadFilerequest=' + error)
	}
	console.log(`FileName: ${fileName}`)
	res.send(content)
}


  
async function removeFile(path: string) {
    try {
        await fss.unlink(path);
        console.log(`Archivo ${path} eliminado correctamente.`);
    } catch (err: any) {
        if (err.code !== 'ENOENT') {
            console.error(`Error al eliminar ${path}:`, err);
        } else {
            console.log(`Archivo ${path} no encontrado, no se requiere eliminar.`);
        }
    }
} 
 async function removeImages(){ //16/11/23

	const today = new Date();
	const yyyy = today.getFullYear();
	const mm = today.getMonth() + 1; // Months start at 0!
	let dd  = today.getDate() - 1
	var day =''
	var month = ''
	var fullDate = ''

	if (dd < 10) {
		day = '0' + dd
	} else {
		day = `${dd}`
	}

	if (mm < 10) {
		month = '0' + mm
	} else {
		month = `${mm}`
	}

	fullDate = yyyy + '-' + month + '-' + day + ',00:00:10'

	console.log('Date = '+ yyyy + '-' + month + '-' + day)
	var dateNow = new Date(fullDate); //yyyy-mm-dd hh:mm:ss
	

	fs.readdirSync('./Media/').forEach(file => {
		const fileDate = fs.statSync(`./Media/${file}`).birthtime
		console.log('fileName='+`./Media/${file}`)

		console.log('fileDate='+fileDate.getDate() + ' -- ' + dateNow.getDate())
		
		if (fileDate.getDate() < dateNow.getDate()) {
			fs.unlinkSync(`./Media/${file}`)
		}

	})
}

function deleteFileIfExists(filePath) {
    if (fs.existsSync(filePath)) {
        fs.unlink(filePath, (err) => {
            if (err) {
                console.error(`Error al eliminar el archivo ${filePath}:`, err);
            } else {
                console.log(`Archivo eliminado con éxito: ${filePath}`);
            }
        });
    } else {
        console.log(`Archivo no encontrado, no se requiere eliminar: ${filePath}`);
    }
}

// Función para eliminar una carpeta si existe
function removeFolder(folderPath) {
    if (fs.existsSync(folderPath)) {
        fs.rm(folderPath, { recursive: true, force: true }, (err) => {
            if (err) {
                console.error(`Error al eliminar la carpeta ${folderPath}:`, err);
            } else {
                console.log(`Carpeta eliminada con éxito: ${folderPath}`);
            }
        });
    } else {
        console.log(`Carpeta no encontrada, no se requiere eliminar: ${folderPath}`);
    }
}

// Función principal para limpiar sesión
function removeAuthFolder(){
	const folder = './baileys_auth_info';
	removeFolder(folder);
	
}
function removeSession() {
    console.log('Antes de borrar archivos y carpetas.');

    // Rutas a eliminar
    // const folder = './baileys_auth_info';
    const files = [
        './auth_info_multi.json',
        // './baileys_store_multi.json',
        './statesLog.json',
    ];

    files.forEach(deleteFileIfExists);
}


async function writeHideState(pState){
	const fileName = '.\\HideState.Json'
	let contentLog;
	contentLog = '{"state":"' + pState + '","date":"'+getDate()+'"}'
	fs.writeFile(fileName, contentLog, function (err) {
		if (err) throw err;
		console.log('Saved!');
	})
}

function readLastHideState(){
	const fileName = '.\\HideState.Json'
	let lastState;


	console.log(`loading state logs from ${fileName}`)

	lastState = ''
	try {
		const file = fs.readFileSync(fileName, { encoding: 'utf-8' }) // load a closed session back if it exists
		var stateInfo = JSON.parse(file) as LastStates
		lastState = stateInfo.state
		if ('state' in stateInfo) {
			console.log('hide=' + stateInfo.state)
			lastState = stateInfo.state
		}
	} catch(error) {
		lastState = 'Hide'
		console.log('error reading lastState=' + error)
	}
	console.log('LAST STATE='+ lastState)
	return lastState
}


// const fs = require('fs');
// const path = require('path');
// const stateFilePath = path.join(__dirname, 'connectionState.json');



// Leer el estado desde un archivo
function readStateFromFile() {
    if (fs.existsSync(stateFilePath)) {
        const data = fs.readFileSync(stateFilePath, 'utf8');
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error('Error al parsear el archivo de estado:', error);
        }
    }
    return { 
        emailSentForConnecting: false, 
        emailSentForOpen: false,
        lastSentDate: '', // Fecha del último envío
		lastSentQrDate: ''
    };
}

// Guardar el estado en un archivo
function writeStateToFile(state) {
    try {
        fs.writeFileSync(stateFilePath, JSON.stringify(state, null, 2));
    } catch (error) {
        console.error('Error al guardar el archivo de estado:', error);
    }
}

async function callSendDeviceStatus(status: string) {
    const data = {
        deviceId: instanceId,
        deviceName: deviceName,
		sender: senderPhone,
        status: status,  // Usamos el valor de `status` que se pasa a la función
        timestamp: new Date().toISOString()
    };

    try {
        // Espera hasta que la función termine de ejecutarse
        const response = await sendAsyncDeviceStatus(data);
        console.log('Respuesta del servidor:', response);
    } catch (error) {
        console.error('Error al enviar los datos:', error);
    }
}




function handleConnectionStatusChange(connectionStatus) {
    console.log(chalk.yellow('Connection status changed to:'), connectionStatus);

    

	console.log(chalk.green('emailSentForConnectig='+emailSentForConnecting));
	console.log(chalk.green('emailSentForOpen='+emailSentForOpen));
	console.log(chalk.green('lastSentDate='+lastSentDate));


    console.log('retriesClose=' + retriesClose);
    console.log('retriesConnecting=' + retriesConnecting);
    console.log('retriesOpen=' + retriesOpen);
	
    // Verificar si cambia de estado o si es un nuevo día
    if (connectionStatus === 'connecting'  &&  !emailSentForOpen && lastSentDate !== currentDate) {
        // sendEmail('QrCode');
        // emailSentForConnecting = true;
        // emailSentForOpen = false; // Reiniciar estado para "open"
        // lastSentDate = currentDate; // Actualizar la fecha del último envío
		// lastSentQrDate = currentDate;
        // writeStateToFile({ emailSentForConnecting, emailSentForOpen, lastSentDate,lastSentQrDate });
		
	}	
  
    if (connectionStatus === 'open' && !emailSentForOpen) {
		if(emailSentForConnecting===true){
			// sendEmail('Open');
			callSendDeviceStatus('Open')
		}
        
        emailSentForOpen = true;
        emailSentForConnecting = false; // Reiniciar estado para "connecting"
        lastSentDate = currentDate; // Actualizar la fecha del último envío
		lastSentQrDate  = ''
        writeStateToFile({ emailSentForConnecting, emailSentForOpen, lastSentDate, lastSentQrDate });
    }

	if (connectionStatus === 'close' && !emailSentForOpen ) {
        // sendEmail('Close');
        // emailSentForOpen = false;
        // emailSentForConnecting = false; // Reiniciar estado para "connecting"
        // lastSentDate   = ''; // forzar el envio
		// lastSentQrDate = '';
        // writeStateToFile({ emailSentForConnecting, emailSentForOpen, lastSentDate, lastSentQrDate });
		
    }

	if (connectionStatus === 'open'){
		resendPendings() // le pido al server principal que se fije y reenvie todos los que pudieren haber pendientes
		setInterval(() => {
			resendPendings()
		}, timeToResendPendings)
		
		// 21-08-25 23:30 - AJE: Cleanup old GUIDs every 6 hours
		setInterval(() => {
			cleanupOldGuids()
			saveSentGuidsToFile()
		}, 6 * 60 * 60 * 1000) // 6 hours
	}

	
    if (retriesConnecting === 0) {
        // sendEmail('ConexionUpdated');
    }

    if (retriesClose === 0) {
        // sendEmail('ConexionUpdated');
    }

    if (connectionStatus === 'open' && retriesOpen === 0) {
        sendMessageWs('set hostvalue QR "' + instanceId + '|success"', 'wss');
        retriesOpen = 1;
    }
    if (connectionStatus === 'connecting') {
        retriesConnecting = 1;
    }
    if (connectionStatus === 'close') {
        retriesClose = 1;
    }


    // Actualizamos el estado previo
    prevConnectionStatus = connectionStatus;
}



// Obtener la fecha actual en formato YYYY-MM-DD
function getCurrentDate() {
    const today = new Date();
    return today.toISOString().split('T')[0];
}

function getCurrentDateTime() {
    const today = new Date();
    return today.toLocaleString('sv-SE', { hour12: false }).replace(' ', 'T');
}


function readLastState() {
    const state = readStateFromFile();

    if (state.emailSentForConnecting) {
        return 'connecting';
    }

    if (state.emailSentForOpen) {
        return 'open';
    }

    return 'unknown'; // Estado predeterminado si ninguno de los dos es verdadero
}


function readLastQrCodeDate(){ //terminar 01/12/2023
	const fileName = '.\\StatesLog.Json'
	let lastDate;


	console.log(`loading date logs from ${fileName}`)

	lastDate = ''
	try {
		const file = fs.readFileSync(fileName, { encoding: 'utf-8' }) // load a closed session back if it exists
		var stateInfo = JSON.parse(file) as LastStates
		lastDate = stateInfo.dateQrCode
		if ('dateQrCode' in stateInfo) {
			console.log('state dateQrCode=' + stateInfo.dateQrCode)
			lastDate = stateInfo.dateQrCode
		}
	} catch(error) {
		lastDate = getDate()
		console.log('error reading lastDate=' + error)
	}
	console.log('LAST STATE dateQrCode='+ lastDate)
	return lastDate
}



// Función para agregar un mensaje a la cola
async function enqueueMessage(item: Omit<QueueItem, 'guid' | 'timestamp'> & { guid?: string }) {
    if (!item.req || !item.res || !item.sock || !item.handler) {
        console.error("Invalid queue item:", item);
        return;
    }
    
    // Get GUID from request body or generate one if not provided
    const guid = item.req.body.guid || item.guid || `auto-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // 04-09-25 23:55 - AJE: Enhanced duplicate check - only consider truly sent if GUID has WhatsApp ID
    if (messageQueue.has(guid)) {
        console.log(`Message with GUID ${guid} already in queue. Skipping duplicate.`);
        if (!item.res.headersSent) {
            item.res.send({
                sent: false,
                message: "Duplicate message",
                phone: item.req.body.phone,
                status: "Duplicate GUID - already in queue",
                guid: guid
            });
        }
        return;
    }
    
    // Check if message was truly sent (has both GUID and WhatsApp ID)
    const existingSentMessage = sentGuids.get(guid);
    if (existingSentMessage && existingSentMessage.whatsappId) {
        console.log(`Message with GUID ${guid} already sent successfully with WhatsApp ID: ${existingSentMessage.whatsappId}. Skipping duplicate.`);
        if (!item.res.headersSent) {
            item.res.send({
                sent: false,
                message: "Duplicate message",
                phone: item.req.body.phone,
                status: "Duplicate GUID - already sent successfully",
                guid: guid,
                whatsappId: existingSentMessage.whatsappId
            });
        }
        return;
    } else if (existingSentMessage) {
        console.log(`Message with GUID ${guid} exists but missing WhatsApp ID. Allowing retry as it may not have been sent successfully.`);
        // Remove the incomplete entry to allow retry
        sentGuids.delete(guid);
    }
    
    const queueItem: QueueItem = {
        ...item,
        guid,
        timestamp: Date.now()
    };
    
    messageQueue.set(guid, queueItem);
    console.log(`Message enqueued with GUID: ${guid}. Queue size: ${messageQueue.size}`);
    
    // Save queue to file after adding new item
    await saveQueueToFile();
    
    processQueue();
}

// 21-08-25 23:30 - AJE: Funciones para persistencia de GUIDs enviados con cleanup de 7 días
// 04-09-25 23:45 - AJE: Updated to handle GUID + WhatsApp ID pairs
function cleanupOldGuids() {
    const cutoffTime = Date.now() - (GUID_RETENTION_DAYS * 24 * 60 * 60 * 1000); // 7 días en ms
    let removedCount = 0;
    
    for (const [guid, messageInfo] of sentGuids.entries()) {
        if (messageInfo.timestamp < cutoffTime) {
            sentGuids.delete(guid);
            removedCount++;
        }
    }
    
    if (removedCount > 0) {
        console.log(`🧹 Cleaned up ${removedCount} old GUIDs (older than ${GUID_RETENTION_DAYS} days)`);
    }
}

async function saveSentGuidsToFile() {
    try {
        // Cleanup old GUIDs before saving
        cleanupOldGuids();
        
        // 04-09-25 23:45 - AJE: Enhanced to save GUID + WhatsApp ID pairs
        const guidsObject: { [key: string]: SentMessageInfo } = {};
        for (const [guid, messageInfo] of sentGuids.entries()) {
            guidsObject[guid] = messageInfo;
        }
        
        const data = {
            sentGuids: guidsObject,
            lastUpdated: new Date().toISOString(),
            retentionDays: GUID_RETENTION_DAYS,
            version: '2.0' // Version to handle backward compatibility
        };
        fs.writeFileSync(sentGuidsFilePath, JSON.stringify(data, null, 2));
        // 04-09-25 23:55 - AJE: Enhanced logging to show GUIDs with/without WhatsApp IDs
        let withWhatsAppId = 0;
        let withoutWhatsAppId = 0;
        for (const [guid, messageInfo] of sentGuids.entries()) {
            if (messageInfo.whatsappId) {
                withWhatsAppId++;
            } else {
                withoutWhatsAppId++;
            }
        }
        console.log(`💾 Saved ${sentGuids.size} GUIDs to file: ${withWhatsAppId} with WhatsApp ID, ${withoutWhatsAppId} without ID (${GUID_RETENTION_DAYS} days retention)`);
    } catch (error) {
        console.error('❌ Error saving sent GUIDs to file:', error);
    }
}

async function loadSentGuidsFromFile() {
    try {
        if (!fs.existsSync(sentGuidsFilePath)) {
            console.log('📝 Sent GUIDs file does not exist, starting with empty map');
            return;
        }

        const data = JSON.parse(fs.readFileSync(sentGuidsFilePath, 'utf-8'));
        
        // 04-09-25 23:45 - AJE: Handle multiple format versions for backward compatibility
        if (data.sentGuids) {
            sentGuids = new Map();
            
            if (Array.isArray(data.sentGuids)) {
                // Very old format (array) - assign current timestamp to all GUIDs
                const currentTime = Date.now();
                for (const guid of data.sentGuids) {
                    sentGuids.set(guid, { timestamp: currentTime });
                }
                console.log(`📖 Loaded ${sentGuids.size} sent GUIDs from very old format (assigned current timestamp)`);
            } else if (data.version === '2.0') {
                // New format v2.0 with GUID + WhatsApp ID pairs
                for (const [guid, messageInfo] of Object.entries(data.sentGuids)) {
                    sentGuids.set(guid, messageInfo as SentMessageInfo);
                }
                // Count GUIDs with and without WhatsApp IDs
                let withWhatsAppId = 0;
                let withoutWhatsAppId = 0;
                for (const [guid, messageInfo] of sentGuids.entries()) {
                    if (messageInfo.whatsappId) {
                        withWhatsAppId++;
                    } else {
                        withoutWhatsAppId++;
                    }
                }
                console.log(`📖 Loaded ${sentGuids.size} GUIDs from file v2.0: ${withWhatsAppId} with WhatsApp ID, ${withoutWhatsAppId} without ID (last updated: ${data.lastUpdated})`);
            } else {
                // Old format v1.0 with only timestamps - migrate to new format
                for (const [guid, timestamp] of Object.entries(data.sentGuids)) {
                    sentGuids.set(guid, { 
                        timestamp: timestamp as number 
                    });
                }
                console.log(`📖 Migrated ${sentGuids.size} sent GUIDs from v1.0 to v2.0 format (last updated: ${data.lastUpdated})`);
            }
            
            // Cleanup old GUIDs after loading
            cleanupOldGuids();
        }
    } catch (error) {
        console.error('❌ Error loading sent GUIDs from file:', error);
        sentGuids = new Map(); // Reset to empty map on error
    }
}

// Queue persistence functions
async function saveQueueToFile() {
    try {
        // Convert Map to serializable object, excluding non-serializable parts
        const queueData: { [key: string]: any } = {};
        
        for (const [guid, item] of messageQueue.entries()) {
            queueData[guid] = {
                guid: item.guid,
                messageType: item.messageType,
                timestamp: item.timestamp,
                // Store only essential request data (excluding res, sock, handler which are not serializable)
                requestData: {
                    phone: item.req.body.phone,
                    text: item.req.body.text,
                    body: item.req.body.body,
                    filename: item.req.body.filename,
                    guid: item.req.body.guid,
                    // Add other needed fields from req.body
                }
            };
        }
        
        // Clean old timestamps from messageSentTimes (older than 1 minute)
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        const recentMessageTimes = messageSentTimes.filter(time => time >= oneMinuteAgo);
        
        const dataToSave = {
            timestamp: now,
            queueSize: messageQueue.size,
            rateLimiting: {
                maxMessagesPerMinute: MAX_MESSAGES_PER_MINUTE,
                messageSentTimes: recentMessageTimes,
                messagesSentInLastMinute: recentMessageTimes.length,
                lastCleanupTime: now
            },
            items: queueData
        };
        
        await writeFile(QUEUE_FILE_PATH, JSON.stringify(dataToSave, null, 2));
        console.log(`Queue saved to file: ${messageQueue.size} items`);
        
    } catch (error) {
        console.error('Error saving queue to file:', error);
    }
}

async function loadQueueFromFile() {
    try {
        if (!fs.existsSync(QUEUE_FILE_PATH)) {
            console.log('Queue file does not exist, starting with empty queue');
            return;
        }
        
        const fileContent = await fss.readFile(QUEUE_FILE_PATH, 'utf8');
        const queueData = JSON.parse(fileContent);
        
        console.log(`Loading queue from file: ${Object.keys(queueData.items || {}).length} items`);
        
        // Restore rate limiting information
        if (queueData.rateLimiting) {
            const rateLimitData = queueData.rateLimiting;
            const now = Date.now();
            const oneMinuteAgo = now - 60000;
            
            // Restore messageSentTimes, filtering out old timestamps
            if (Array.isArray(rateLimitData.messageSentTimes)) {
                // Clear current array and add only recent timestamps
                messageSentTimes.length = 0;
                rateLimitData.messageSentTimes.forEach(timestamp => {
                    if (timestamp >= oneMinuteAgo) {
                        messageSentTimes.push(timestamp);
                    }
                });
                
                console.log(`Restored rate limiting: ${messageSentTimes.length}/${MAX_MESSAGES_PER_MINUTE} messages sent in last minute`);
            }
        }
        
        // Note: We can't restore the full queue items (req, res, sock, handler) from file
        // This function is mainly for cleanup - removing old items
        // Active processing should be handled by the application restart logic
        
        // Clean up old items (older than 1 hour)
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        let cleanedCount = 0;
        
        for (const [guid, item] of Object.entries(queueData.items || {})) {
            const itemData = item as any;
            if (itemData.timestamp < oneHourAgo) {
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`Cleaned ${cleanedCount} old items from queue file`);
            // Save cleaned queue back to file
            await saveQueueToFile();
        }
        
    } catch (error) {
        console.error('Error loading queue from file:', error);
    }
}

// Function to check if we can send a message based on rate limit
function canSendMessage(): boolean {
    const now = Date.now();
    const oneMinuteAgo = now - 60000; // 60 seconds ago
    
    // Remove timestamps older than 1 minute
    while (messageSentTimes.length > 0 && messageSentTimes[0] < oneMinuteAgo) {
        messageSentTimes.shift();
    }
    
    // Check if we're under the limit
    return messageSentTimes.length < MAX_MESSAGES_PER_MINUTE;
}

// Function to record a message was sent
function recordMessageSent() {
    messageSentTimes.push(Date.now());
}

// Function to get random delay between 1-3 seconds
function getRandomDelay(): number {
    return Math.random() * 2000 + 1000; // Random between 1000ms (1s) and 3000ms (3s)
}

// Función para procesar la cola
async function processQueue() {
    if (isProcessing) return;
    isProcessing = true;

    while (messageQueue.size > 0) {
        // Check rate limit before processing
        if (!canSendMessage()) {
            console.log(`Rate limit reached (${MAX_MESSAGES_PER_MINUTE} messages/minute). Waiting...`);
            // Wait for the next minute window
            const now = Date.now();
            const oldestMessage = messageSentTimes[0];
            const waitTime = 60000 - (now - oldestMessage) + 100; // Wait until oldest message is over 1 minute old
            
            if (waitTime > 0) {
                console.log(`Waiting ${Math.round(waitTime/1000)} seconds before sending next message`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
            continue;
        }

        // Get the first item from the Map (FIFO order)
        const firstEntry = messageQueue.entries().next();
        if (firstEntry.done) continue;
        
        const [guid, current] = firstEntry.value;
        messageQueue.delete(guid); // Remove from queue
        
        // Save queue state after removing item
        await saveQueueToFile();
        
        if (!current) continue; // Si por alguna razón es undefined, lo ignoramos

        try {
            console.log(`Processing message with GUID: ${guid} from queue. Queue length: ${messageQueue.size}`);
            
            // 04-09-25 23:45 - AJE: Capture WhatsApp response to get real message ID
            let whatsappResponse: any = null;
            if (current.messageType === 'text') {
                whatsappResponse = await sendTextMessage(current.req, current.res, current.sock, current.handler);
            } else if (current.messageType === 'image') {
                whatsappResponse = await sendFile(current.req, current.res, current.sock, current.handler);
            }
            
            // Record that we sent a message
            recordMessageSent();
            
            // 04-09-25 23:55 - AJE: Only mark as truly sent if we have WhatsApp ID response
            const whatsappId = whatsappResponse?.key?.id;
            
            if (whatsappId) {
                // Message sent successfully with WhatsApp confirmation
                sentGuids.set(guid, { 
                    timestamp: Date.now(),
                    whatsappId: whatsappId 
                });
                console.log(`✅ Message with GUID ${guid} sent successfully with WhatsApp ID: ${whatsappId}. Messages sent in last minute: ${messageSentTimes.length}/${MAX_MESSAGES_PER_MINUTE}`);
            } else {
                // Message may have failed or response incomplete - don't mark as sent
                console.log(`⚠️ Message with GUID ${guid} processed but no WhatsApp ID received. Not marking as sent to allow retry. Messages sent in last minute: ${messageSentTimes.length}/${MAX_MESSAGES_PER_MINUTE}`);
            }
            
            await saveSentGuidsToFile();
            
        } catch (error) {
            console.error(`Error processing message with GUID ${guid}:`, error);
            // Only send response if headers haven't been sent yet
            if (!current.res.headersSent) {
                current.res.send({
                    sent: false,
                    message: "Error processing message",
                    phone: current.req.body.phone,
                    status: error.message,
                    guid: guid
                });
            }
        }

        // Wait between 1-3 seconds before processing next message
        const delay = getRandomDelay();
        console.log(`Waiting ${Math.round(delay/1000 * 10)/10} seconds before next message...`);
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    isProcessing = false;
}

// Legacy function - kept for backward compatibility but not used in new queue system
function randomDelay(min: number, max: number): Promise<void> {
    const delay = Math.random() * (max - min) + min; // Genera un número aleatorio entre min y max
    return new Promise(resolve => setTimeout(resolve, delay * 1000)); // Convierte a milisegundos
}

// // Función auxiliar para esperar un tiempo
// function delay(ms: number): Promise<void> {
//     return new Promise(resolve => setTimeout(resolve, ms));
// }
async function getQRCode(instanceId){
	let fileName = `./Media/qrCode_${instanceId}.png`;
	// Imprime la ruta final para verificar
	console.log('getQRCode Final file path:', fileName);
	// let content
	try {
		const content = fs.readFileSync(fileName);
        if (!content || content.length === 0) {
            console.error(`El archivo está vacío: ${fileName}`);
            return;
        }
		// console.log('archivo='+content)
		const qrCodeBase64 = 'data:image/png;base64,'+content.toString('base64');
		sendMessageWs('set hostvalue QR "' + instanceId + '|' + qrCodeBase64 + '"','wss') //reporto el estado actual al webserver para que se actulice el estado
	} catch(error) {
		console.log('getQRCode error Reading File=' + error)
	}
}

interface DeleteResponse {
    key: {
        remoteJid: string;
        fromMe: boolean;
        id: string;
    };
    message?: {
        protocolMessage?: {
            key: {
                remoteJid: string;
                fromMe: boolean;
                id: string;
            };
            type: string;
        };
    };
    messageTimestamp?: string;
    status?: string;
}

async function deleteMessage({ req, res, sock }): Promise<DeleteResponse> {
    try {
        const key = {
            remoteJid: `${req.body.phone}@s.whatsapp.net`,
            id: req.body.messageId,
            fromMe: true
        };

        // Llamar a la API de WhatsApp para eliminar el mensaje
        const deleteResponse = await sock.sendMessage(key.remoteJid, { delete: key });
        console.log(chalk.yellow('response deleteMessage='), JSON.stringify(deleteResponse));

        const formattedResponse = {
            key: deleteResponse.key, // Clave del mensaje
            message: deleteResponse?.message, // Mensaje (puede ser undefined)
            messageTimestamp: deleteResponse?.messageTimestamp || '', // Timestamp del mensaje, vacío si no existe
            type: deleteResponse?.message?.protocolMessage?.type || '', // Tipo del mensaje de protocolo (REVOKE si existe)
            status: deleteResponse?.status || '', // Estado del mensaje
        };

        // Interpreta el tipo de mensaje
        const messageType = formattedResponse?.type === 0 ? 'REVOKE' : formattedResponse?.type;
        console.log('Mensaje tipo:', messageType);

        formattedResponse.type = messageType;

        return formattedResponse;
        
    } catch (error) {
        console.error('Error deleting message:', error);
        throw error; // Manejo del error
    }
}

async function deleteResendMessage({ req, res, sock, handler, messageType }) {
    try {
        // Paso 1: Borrar el mensaje
        const deleteResponse: DeleteResponse = await deleteMessage({ req, res, sock });

        // Extraer el tipo de protocolo del mensaje eliminado
        const type = deleteResponse?.message?.protocolMessage?.type;
        console.log('Respuesta al eliminar mensaje:', deleteResponse);
        console.log('Tipo de mensaje tras eliminar:', type);
		
        // if (type === 'REVOKE') {
        //     console.log('Mensaje eliminado exitosamente (REVOKE)');
        // } else {
        //     console.warn('El mensaje no pudo ser eliminado o el tipo no es REVOKE');
        //     return res.send({
        //         success: false,
        //         message: "No se pudo eliminar el mensaje correctamente",
        //         type,
        //     });
        // }

        // Paso 2: Reenviar el mensaje utilizando sendTextMessage
        console.log('Reenviando mensaje...');
		
		let messageType = 'text';
		if (!req.body || !req.body.filename) {
			messageType = 'text';
		}else{
			messageType = 'image';
		}
		await enqueueMessage({ req, res, sock, handler,messageType});
        // await sendTextMessage(req, res, sock, handler);

    } catch (error) {
        console.error('Error en deleteResendMessage:', error);

        res.status(500).send({
            success: false,
            error: error.message,
            message: "No se pudo eliminar y/o reenviar el mensaje",
        });
    }
}