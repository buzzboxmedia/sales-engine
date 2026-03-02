import { Contact } from './contact.js';
import { Sequence } from './sequence.js';
import { Send } from './send.js';
import { SendingAccount } from './sendingAccount.js';
import { Conversion } from './conversion.js';

// Associations
Contact.hasMany(Send, { foreignKey: 'contact_id', as: 'sends' });
Send.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

Sequence.hasMany(Send, { foreignKey: 'sequence_id', as: 'sends' });
Send.belongsTo(Sequence, { foreignKey: 'sequence_id', as: 'sequence' });

Contact.hasMany(Conversion, { foreignKey: 'contact_id', as: 'conversions' });
Conversion.belongsTo(Contact, { foreignKey: 'contact_id', as: 'contact' });

export { Contact, Sequence, Send, SendingAccount, Conversion };
